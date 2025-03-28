/**
 * Fetches and flattens a list of top games from a remote JSON endpoint.
 *
 * Note: Personally, I would have used async/await for readability and clarity,
 * but I chose to follow the existing code style and stick with chained promises (then/catch).
 *
 * @param {string} url - The URL pointing to the aggregated JSON data.
 * @returns {Promise<Object[]>} - A promise resolving to a flat array of game objects.
 */

function fetchAggregatedTopGames(url) {
  return fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      if (!Array.isArray(data)) {
        throw new Error('Unexpected JSON structure: expected an array');
      }

      // Flatten the nested arrays into a single flat array
      return data.reduce((acc, group) => acc.concat(group), []);
    })
    .catch((error) => {
      console.error('Failed to fetch or process top games:', error);
      throw error;
    });
}

module.exports = { fetchAggregatedTopGames };
