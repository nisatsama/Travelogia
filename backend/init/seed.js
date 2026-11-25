const mongoose = require("mongoose");
const env = require("../config/env");
const Travel = require("../models/Travel");
const Package = require("../models/Package");
const destinationsData = require("../data/destinationsData");
const packageData = require("../data/packageData");

async function seedDatabase() {
  if (!env.MONGODB_URI) {
    console.error("ERROR: MONGODB_URI (or MONGO_URL) must be set to seed MongoDB.");
    process.exit(1);
  }

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log("Connected to MongoDB for idempotent seeding...");

    // Idempotent destination upserts keyed by unique slug
    const travelOps = destinationsData.map((dest) => {
      const { _id, ...payload } = dest;
      return {
        updateOne: {
          filter: { slug: payload.slug },
          update: { $setOnInsert: payload },
          upsert: true,
        },
      };
    });

    const travelResult = await Travel.bulkWrite(travelOps, { ordered: false });
    console.log(
      `Destinations seeded idempotently — inserted: ${travelResult.upsertedCount}, existing skipped: ${destinationsData.length - travelResult.upsertedCount}, total target: ${destinationsData.length}`,
    );

    // Idempotent package upserts keyed by title + category
    const pkgOps = packageData.map((pkg) => {
      const { _id, ...payload } = pkg;
      return {
        updateOne: {
          filter: { title: payload.title, category: payload.category },
          update: { $setOnInsert: payload },
          upsert: true,
        },
      };
    });

    const pkgResult = await Package.bulkWrite(pkgOps, { ordered: false });
    console.log(
      `Packages seeded idempotently — inserted: ${pkgResult.upsertedCount}, existing skipped: ${packageData.length - pkgResult.upsertedCount}, total target: ${packageData.length}`,
    );

    const totalTravels = await Travel.countDocuments();
    const totalPackages = await Package.countDocuments();
    console.log(
      `Seed complete. MongoDB now holds ${totalTravels} destinations and ${totalPackages} packages.`,
    );
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
