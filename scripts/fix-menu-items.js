/**
 * fix-menu-items.js
 *
 * Fixes menu documents where items[] was saved as raw ObjectIds
 * instead of {item: ObjectId, itemModel: "SiteItem"} subdocuments.
 *
 * Usage:
 *   node scripts/fix-menu-items.js
 *
 * Optional: target a specific menu by _id
 *   node scripts/fix-menu-items.js 6a92322e52e41c04941e673a
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const mongoose = require("mongoose");
const Menu = require("../models/Menu");

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;

if (!MONGO_URI) {
  console.error("❌  No MONGO_URI / DATABASE_URL found in .env");
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("✅  Connected to MongoDB");

  const targetId = process.argv[2] || null;

  const query = targetId ? { _id: targetId } : {};

  const menus = await Menu.find(query).lean();

  console.log(`🔍  Checking ${menus.length} menu(s)…`);

  let fixed = 0;

  for (const menu of menus) {
    const items = menu.items || [];

    const hasBroken = items.some(
      (entry) =>
        // Raw ObjectId: no .item or .itemModel property
        !entry ||
        typeof entry !== "object" ||
        !entry.item ||
        !entry.itemModel,
    );

    if (!hasBroken) {
      continue;
    }

    const normalized = items.map((entry) => {
      if (entry && typeof entry === "object" && entry.item && entry.itemModel) {
        return { item: entry.item, itemModel: entry.itemModel };
      }
      // entry is a raw ObjectId (or ObjectId-like object without .item)
      const rawId = entry?._id || entry;
      return { item: rawId, itemModel: "SiteItem" };
    });

    await Menu.updateOne(
      { _id: menu._id },
      { $set: { items: normalized } },
    );

    console.log(
      `  ✔  Fixed menu "${menu.name}" (${menu._id}) — ${normalized.length} items normalized`,
    );
    fixed++;
  }

  if (fixed === 0) {
    console.log("  ✨  No broken menus found — nothing to fix.");
  } else {
    console.log(`\n✅  Fixed ${fixed} menu(s).`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("❌  Error:", err);
  process.exit(1);
});
