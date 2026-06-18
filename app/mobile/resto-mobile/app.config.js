const fs = require('fs');
const path = require('path');

function loadDotenv() {
  const dotenvPath = path.resolve(__dirname, '.env');

  if (!fs.existsSync(dotenvPath)) {
    return {};
  }

  const dotenv = require('dotenv');
  const result = dotenv.config({ path: dotenvPath });

  return result.parsed || {};
}

const dotEnvValues = loadDotenv();
const appJson = require('./app.json');

module.exports = {
  ...appJson,
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      ...dotEnvValues,
    },
  },
};
