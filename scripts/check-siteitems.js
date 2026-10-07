require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

mongoose
  .connect(process.env.MONGO_URL)
  .then(async () => {
    const db = mongoose.connection.db;

    // Get the menu
    const menu = await db.collection("menus").findOne({
      _id: new mongoose.Types.ObjectId("6a92322e52e41c04941e673a"),
    });

    console.log("Restaurant ID on menu:", String(menu.restaurant));
    console.log("categorySystem:", menu.categorySystem);

    const itemIds = menu.items.map((e) => new mongoose.Types.ObjectId(e.item));
    console.log("Item IDs:", itemIds.map(String));

    const siteItems = await db
      .collection("siteitems")
      .find({ _id: { $in: itemIds } })
      .toArray();

    console.log("\nSiteItems found:", siteItems.length);

    const restaurantId = String(menu.restaurant);

    siteItems.forEach((si) => {
      const placements = si.placements || [];
      const match = placements.filter(
        (p) => String(p.restaurant) === restaurantId,
      );
      console.log(
        `  - ${si._id} | placements total: ${placements.length} | matches restaurant: ${match.length}`,
      );
      if (placements.length > 0) {
        console.log("    placement restaurants:", placements.map((p) => String(p.restaurant)));
      }
    });

    await mongoose.disconnect();
  })
  .catch((e) => {
    console.error("ERR", e.message);
    process.exit(1);
  });
