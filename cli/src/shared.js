// VS Code extension bilan umumiy modullar: npm paketida cli/shared/ da, repo ichida esa ildizdagi shared/ da
const path = require('path');

module.exports = function shared(name) {
  try {
    return require(path.join(__dirname, '..', 'shared', name));
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    return require(path.join(__dirname, '..', '..', 'shared', name));
  }
};
