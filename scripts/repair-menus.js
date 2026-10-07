/**
 * repair-menus.js
 *
 * For each menu:
 * 1. Removes entries where item is null (broken populate = ghost IDs)
 * 2. Rebuilds from SiteItems that actually have a placement for this restaurant
 *
 * Run: node scripts/repair-menus.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");

mongoose
  .connect(process.env.MONGO_URL)
  .then(async () => {
    const db = mongoose.connection.db;
    console.log("Connected to:", db.databaseName);

    const menus = await db.collection("menus").find({}).toArray();
    console.log("Total menus:", menus.length);

    for (const menu of menus) {
      const items = menu.items || [];
      const restaurantId = menu.restaurant;

      if (!restaurantId) continue;

      // Check which item IDs actually exist in the siteitems collection
      const itemIds = items
        .map((e) => {
          try {
            return new mongoose.Types.ObjectId(e.item || e);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      if (itemIds.length === 0) {
        console.log(`SKIP ${menu.name} — no items`);
        continue;
      }

      const existing = await db
        .collection("siteitems")
        .find({ _id: { $in: itemIds } })
        .project({ _id: 1 })
        .toArray();

      const existingSet = new Set(existing.map((s) => String(s._id)));
      const ghostCount = itemIds.filter(
        (id) => !existingSet.has(String(id)),
      ).length;

      if (ghostCount === 0) {
        console.log(`OK   ${menu.name} (${menu.slug})`);
        continue;
      }

      console.log(
        `FIX  ${menu.name} (${menu.slug}) — ${ghostCount} ghost IDs out of ${itemIds.length}`,
      );

      // Find all SiteItems that have a placement for this restaurant
      const siteItemsForRestaurant = await db
        .collection("siteitems")
        .find({ "placements.restaurant": restaurantId })
        .project({ _id: 1 })
        .toArray();

      console.log(
        `     -> Found ${siteItemsForRestaurant.length} SiteItems with placement for this restaurant`,
      );

      // Build new items array: keep valid existing ones + add any from placements not already listed
      const validExistingItems = items.filter((e) => {
        try {
          return existingSet.has(
            String(new mongoose.Types.ObjectId(e.item || e)),
          );
        } catch {
          return false;
        }
      });

      const validExistingIds = new Set(
        validExistingItems.map((e) => String(e.item || e)),
      );

      const newItems = [
        ...validExistingItems.map((e) => ({
          item: e.item || e,
          itemModel: "SiteItem",
        })),
        ...siteItemsForRestaurant
          .filter((si) => !validExistingIds.has(String(si._id)))
          .map((si) => ({ item: si._id, itemModel: "SiteItem" })),
      ];

      await db
        .collection("menus")
        .updateOne({ _id: menu._id }, { $set: { items: newItems } });

      console.log(`     -> Rebuilt with ${newItems.length} items`);
    }

    console.log("\nDone.");
    await mongoose.disconnect();
  })
  .catch((e) => {
    console.error("ERR", e.message);
    process.exit(1);
  });
