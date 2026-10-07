require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Menu = require("../models/Menu");

mongoose
  .connect(process.env.MONGO_URL)
  .then(async () => {
    console.log("connected to:", mongoose.connection.name);
    const menus = await Menu.find({}).select("_id name items").lean();
    console.log("total menus:", menus.length);
    let fixed = 0;
    for (const m of menus) {
      const items = m.items || [];
      const broken = items.filter(
        (e) => !e || typeof e !== "object" || !e.item || !e.itemModel,
      );
      if (broken.length) {
        console.log(
          "BROKEN -",
          String(m._id),
          "-",
          m.name,
          "- broken items:",
          broken.length,
          "/ total:",
          items.length,
        );
        const normalized = items.map((e) => {
          if (e && e.item && e.itemModel)
            return { item: e.item, itemModel: e.itemModel };
          const rawId = e && e._id ? e._id : e;
          return { item: rawId, itemModel: "SiteItem" };
        });
        await Menu.updateOne(
          { _id: m._id },
          { $set: { items: normalized } },
        );
        console.log("  -> FIXED");
        fixed++;
      } else {
        console.log("OK -", String(m._id), "-", m.name);
      }
    }
    console.log("\nFixed:", fixed, "menu(s)");
    await mongoose.disconnect();
  })
  .catch((e) => {
    console.error("ERR", e.message);
    process.exit(1);
  });
