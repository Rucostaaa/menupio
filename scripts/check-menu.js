require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

mongoose
  .connect(process.env.MONGO_URL)
  .then(async () => {
    const db = mongoose.connection.db;
    console.log("DB name:", db.databaseName);

    const menu = await db
      .collection("menus")
      .findOne({ _id: new mongoose.Types.ObjectId("6a92322e52e41c04941e673a") });

    if (!menu) {
      console.log("Menu NOT found");
    } else {
      console.log("Menu found:", menu.name, "slug:", menu.slug);
      console.log("items count:", menu.items?.length);
      console.log("First 2 items:", JSON.stringify(menu.items?.slice(0, 2), null, 2));
    }

    await mongoose.disconnect();
  })
  .catch((e) => {
    console.error("ERR", e.message);
    process.exit(1);
  });
