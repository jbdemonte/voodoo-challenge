const express = require('express');
const bodyParser = require('body-parser');
const { Op } = require('sequelize');
const db = require('./models');
const { fetchAggregatedTopGames } = require('./utils/fetch_aggregated_top_games');

// load environment variables from .env file
require('dotenv').config();

const app = express();

app.use(bodyParser.json());
app.use(express.static(`${__dirname}/static`));

app.get('/api/games', (req, res) => db.Game.findAll()
  .then((games) => res.send(games))
  .catch((err) => {
    console.log('***There was an error querying games', JSON.stringify(err));
    return res.send(err);
  }));

app.post('/api/games', (req, res) => {
  const { publisherId, name, platform, storeId, bundleId, appVersion, isPublished } = req.body;
  return db.Game.create({ publisherId, name, platform, storeId, bundleId, appVersion, isPublished })
    .then((game) => res.send(game))
    .catch((err) => {
      console.log('***There was an error creating a game', JSON.stringify(err));
      return res.status(400).send(err);
    });
});

app.delete('/api/games/:id', (req, res) => {
  // eslint-disable-next-line radix
  const id = parseInt(req.params.id);
  return db.Game.findByPk(id)
    .then((game) => game.destroy({ force: true }))
    .then(() => res.send({ id }))
    .catch((err) => {
      console.log('***There was an error deleting game', JSON.stringify(err));
      res.status(400).send(err);
    });
});

app.put('/api/games/:id', (req, res) => {
  // eslint-disable-next-line radix
  const id = parseInt(req.params.id);
  return db.Game.findByPk(id)
    .then((game) => {
      const { publisherId, name, platform, storeId, bundleId, appVersion, isPublished } = req.body;
      return game.update({ publisherId, name, platform, storeId, bundleId, appVersion, isPublished })
        .then(() => res.send(game))
        .catch((err) => {
          console.log('***There was an error updating game', JSON.stringify(err));
          res.status(400).send(err);
        });
    });
});

app.post('/api/games/search', (req, res) => {
  let { name, platform } = req.body;

  const where = {};

  // Normalize inputs
  platform = (platform || '').trim().toLowerCase();
  name = (name || '').trim().toLowerCase();

  if (name && !platform) {
    return res.status(400).json({ error: 'Platform is required when name is provided' });
  }

  // Populate where clause
  if (platform) {
    where.platform = platform;
  }
  if (name) {
    where.name = {
      [Op.like]: `%${name}%`,
    };
  }

  return db.Game.findAll({ where })
    .then((games) => res.send(games))
    .catch((err) => {
      console.log('***There was an error searching games using where=', JSON.stringify(where), JSON.stringify(err));
      return res.status(400).send(err);
    });
});

// Populate the database with the top 100 IOS / ANDROID
// Previous data are not flushed (future feature?)
// Existing games are not updated (future feature?)
app.post('/api/games/populate', (req, res) => {
  const iosUrl = process.env.JSON_URL_IOS;
  const androidUrl = process.env.JSON_URL_ANDROID;

  if (!iosUrl || !androidUrl) {
    console.log('***The file .env file is missing or incomplete (tip: run `cp .env.example .env`)');
    return res.status(500).send({ error: 'Missing IOS_JSON_URL or ANDROID_JSON_URL in .env' });
  }

  return Promise.all([
    fetchAggregatedTopGames(iosUrl),
    fetchAggregatedTopGames(androidUrl),
  ])
    .then(([iosGames, androidGames]) => {
      // Both iosGames, androidGames contains more than 100 games, but all are ranked from 1 to 100
      // not sure if I should limit both to 100, let's assume it's the json aggregator responsibility
      // to filter those entries
      const topGames = iosGames.concat(androidGames);

      if (!topGames) {
        return res.status(200).send({ message: 'No new games to add (no data available).' });
      }

      // Get existing ones from DB
      return db.Game.findAll({
        attributes: ['bundleId'], // only need to know the presence, so bundleId is enough
        where: {
          bundleId: topGames.map((game) => game.bundle_id),
        },
      })
        .then((existingGames) => {
          const existingBundleIds = new Set(existingGames.map((g) => g.bundleId));

          // Only keep new games
          const newGames = topGames
            .filter((game) => game.bundle_id && !existingBundleIds.has(game.bundle_id))
            .map((game) => ({
              publisherId: game.publisher_id,
              name: game.name,
              platform: game.os === 'ios' ? 'ios' : 'android',
              storeId: game.app_id.toString(), // convert ios app_id from number
              bundleId: game.bundle_id,
              appVersion: game.version || '',
              isPublished: true,
            }));

          if (newGames.length === 0) {
            return res.status(200).send({ message: 'No new games to add.' });
          }

          return db.Game.bulkCreate(newGames)
            .then(() => {
              console.log(`Populated ${newGames.length} new games.`);
              res.status(201).send({ added: newGames.length });
            });
        });
    })
    .catch((err) => {
      console.log('***There was an error populating games', JSON.stringify(err));
      res.status(500).send({ error: 'Failed to populate database' });
    });
});

app.listen(3000, () => {
  console.log('Server is up on port 3000');
});

module.exports = app;
