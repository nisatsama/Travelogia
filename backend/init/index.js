const mongoose = require("mongoose");
const data = require("./data");
const Travel = require("../model/travel");
const MONGO_URL = process.env.MONGO_URL;
mongoose
  .connect(MONGO_URL)
  .then(() => {
    console.log("Connected to DB");
  })
  .catch((err) => {
    console.log("Error connecting to DB", err);
  });

async function seedDB() {
  try {
    await Travel.deleteMany({});

    await Travel.insertMany(data);

    const allData = await Travel.find({});

    console.log("Total Documents:", allData.length);
    console.log("DB Seeded");
  } catch (err) {
    console.log(err);
  } finally {
    mongoose.connection.close();
  }
}

seedDB();
