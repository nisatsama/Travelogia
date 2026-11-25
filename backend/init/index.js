const { seedDatabase } = require("./seed");

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
