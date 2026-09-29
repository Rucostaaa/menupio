const mongoose = require("mongoose");
const fs = require("fs/promises");
const SiteItem = require("../models/SiteItem");

const Image = require("../models/Image");
const cloudinary = require("../utils/Claudinary");

// ============================================================
// HELPERS
// ============================================================

const uploadToCloudinary = async (filePath, folder) => {
  return cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: "image",
  });
};

const deleteLocalFile = async (filePath) => {
  if (!filePath) return;

  try {
    await fs.unlink(filePath);
  } catch (error) {
    // File may already be gone.
    console.error("Local file delete error:", error.message);
  }
};

const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
    });
  } catch (error) {
    console.error(`Cloudinary delete failed for ${publicId}:`, error.message);
  }
};

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// ============================================================
// GET ALL
// ============================================================

const getImages = async (req, res) => {
  try {
    const images = await Image.find().sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      data: images,
    });
  } catch (error) {
    console.error("getImages error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch images",
      error: error.message,
    });
  }
};

// ============================================================
// GET ONE
// ============================================================

const getImageById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid image ID",
      });
    }

    const image = await Image.findById(id).lean();

    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: image,
    });
  } catch (error) {
    console.error("getImageById error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch image",
      error: error.message,
    });
  }
};

// ============================================================
// CREATE
// ============================================================

const createImage = async (req, res) => {
  const uploadedCloudinaryIds = [];

  try {
    const flyerFiles = req.files?.flyer || [];
    const backgroundFile = req.files?.background?.[0];

    const flyer = [];

    // --------------------------------------------------------
    // UPLOAD FLYER IMAGES
    // --------------------------------------------------------

    for (const file of flyerFiles) {
      try {
        const result = await uploadToCloudinary(file.path, "menupio/flyer");

        uploadedCloudinaryIds.push(result.public_id);

        flyer.push({
          image: result.secure_url,

          publicId: result.public_id,

          imageSettings: {
            h: "105%",
            w: "105%",
            translateX: "14%",
            translateY: "2%",
            rotate: "0deg",
            zIndex: 1,
            opacity: 1,
          },
        });
      } finally {
        await deleteLocalFile(file.path);
      }
    }

    // --------------------------------------------------------
    // UPLOAD BACKGROUND
    // --------------------------------------------------------

    let background = "";

    if (backgroundFile) {
      try {
        const result = await uploadToCloudinary(
          backgroundFile.path,
          "menupio/background",
        );

        uploadedCloudinaryIds.push(result.public_id);

        background = result.secure_url;
      } finally {
        await deleteLocalFile(backgroundFile.path);
      }
    }

    // --------------------------------------------------------
    // CREATE DATABASE DOCUMENT
    // --------------------------------------------------------

    const image = await Image.create({
      flyer,
      background,
    });

    return res.status(201).json({
      success: true,
      message: "Image created successfully",
      data: image,
    });
  } catch (error) {
    console.error("createImage error:", error);

    // --------------------------------------------------------
    // ROLLBACK CLOUDINARY UPLOADS
    // --------------------------------------------------------

    for (const publicId of uploadedCloudinaryIds) {
      await deleteFromCloudinary(publicId);
    }

    // --------------------------------------------------------
    // CLEAN ANY REMAINING LOCAL FILES
    // --------------------------------------------------------

    const flyerFiles = req.files?.flyer || [];
    const backgroundFile = req.files?.background?.[0];

    for (const file of flyerFiles) {
      await deleteLocalFile(file.path);
    }

    if (backgroundFile) {
      await deleteLocalFile(backgroundFile.path);
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create image",
      error: error.message,
    });
  }
};

// ============================================================
// UPDATE WHOLE IMAGE DOCUMENT
//
// Can:
// - replace background
// - add new flyer images
// - update flyer settings
//
// Existing flyers are NOT deleted automatically.
// ============================================================

const updateImage = async (req, res) => {
  const uploadedCloudinaryIds = [];

  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid image ID",
      });
    }

    const image = await Image.findById(id);

    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    const flyerFiles = req.files?.flyer || [];
    const backgroundFile = req.files?.background?.[0];

    // ========================================================
    // REPLACE BACKGROUND
    // ========================================================

    if (backgroundFile) {
      let result;

      try {
        result = await uploadToCloudinary(
          backgroundFile.path,
          "menupio/background",
        );

        uploadedCloudinaryIds.push(result.public_id);

        const oldBackground = image.background;

        image.background = result.secure_url;

        /*
         * NOTE:
         * Your current schema only stores the background URL.
         * It does NOT store background publicId.
         *
         * Therefore we cannot reliably delete the old background
         * from Cloudinary here unless we derive/store its publicId.
         */
        await deleteLocalFile(backgroundFile.path);

        void oldBackground;
      } catch (error) {
        await deleteLocalFile(backgroundFile.path);
        throw error;
      }
    }

    // ========================================================
    // ADD NEW FLYER IMAGES
    // ========================================================

    for (const file of flyerFiles) {
      try {
        const result = await uploadToCloudinary(file.path, "menupio/flyer");

        uploadedCloudinaryIds.push(result.public_id);

        image.flyer.push({
          image: result.secure_url,

          publicId: result.public_id,

          imageSettings: {
            h: "105%",
            w: "105%",
            translateX: "14%",
            translateY: "2%",
            rotate: "0deg",
            zIndex: 1,
            opacity: 1,
          },
        });
      } finally {
        await deleteLocalFile(file.path);
      }
    }

    // ========================================================
    // UPDATE FLYER SETTINGS
    //
    // Expected:
    //
    // flyerSettings: JSON.stringify([
    //   {
    //     id: "flyerMongoId",
    //     imageSettings: {
    //       h: "120%",
    //       w: "110%"
    //     }
    //   }
    // ])
    // ========================================================

    if (req.body.flyerSettings) {
      let flyerSettings;

      try {
        flyerSettings =
          typeof req.body.flyerSettings === "string"
            ? JSON.parse(req.body.flyerSettings)
            : req.body.flyerSettings;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid flyerSettings JSON",
        });
      }

      if (!Array.isArray(flyerSettings)) {
        return res.status(400).json({
          success: false,
          message: "flyerSettings must be an array",
        });
      }

      for (const setting of flyerSettings) {
        if (!setting.id) continue;

        if (!isValidObjectId(setting.id)) {
          continue;
        }

        const flyerItem = image.flyer.id(setting.id);

        if (!flyerItem) continue;

        if (setting.imageSettings) {
          Object.assign(flyerItem.imageSettings, setting.imageSettings);
        }
      }
    }

    await image.save();

    return res.status(200).json({
      success: true,
      message: "Image updated successfully",
      data: image,
    });
  } catch (error) {
    console.error("updateImage error:", error);

    // Rollback newly uploaded Cloudinary images
    for (const publicId of uploadedCloudinaryIds) {
      await deleteFromCloudinary(publicId);
    }

    // Clean local files
    const flyerFiles = req.files?.flyer || [];
    const backgroundFile = req.files?.background?.[0];

    for (const file of flyerFiles) {
      await deleteLocalFile(file.path);
    }

    if (backgroundFile) {
      await deleteLocalFile(backgroundFile.path);
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update image",
      error: error.message,
    });
  }
};

// ============================================================
// DELETE WHOLE IMAGE DOCUMENT
// ============================================================

const deleteImage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid image ID",
      });
    }

    const image = await Image.findById(id);

    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    // --------------------------------------------------------
    // DELETE ALL FLYER IMAGES FROM CLOUDINARY
    // --------------------------------------------------------

    for (const flyerItem of image.flyer) {
      if (flyerItem.publicId) {
        await deleteFromCloudinary(flyerItem.publicId);
      }
    }

    /*
     * IMPORTANT:
     * background is currently just a String in your schema.
     *
     * There is no background.publicId available.
     *
     * So the background cannot safely be deleted from Cloudinary
     * here.
     */

    await Image.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("deleteImage error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete image",
      error: error.message,
    });
  }
};

// ============================================================
// ADD ONE FLYER
// ============================================================

const addFlyerImage = async (req, res) => {
  let uploadedPublicId = null;

  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid image ID",
      });
    }

    const image = await Image.findById(id);

    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Flyer image is required",
      });
    }

    try {
      const result = await uploadToCloudinary(req.file.path, "menupio/flyer");

      uploadedPublicId = result.public_id;

      image.flyer.push({
        image: result.secure_url,

        publicId: result.public_id,

        imageSettings: {
          h: "105%",
          w: "105%",
          translateX: "14%",
          translateY: "2%",
          rotate: "0deg",
          zIndex: 1,
          opacity: 1,
        },
      });

      await image.save();
    } finally {
      await deleteLocalFile(req.file.path);
    }

    return res.status(201).json({
      success: true,
      message: "Flyer image added successfully",
      data: image,
    });
  } catch (error) {
    console.error("addFlyerImage error:", error);

    if (uploadedPublicId) {
      await deleteFromCloudinary(uploadedPublicId);
    }

    if (req.file?.path) {
      await deleteLocalFile(req.file.path);
    }

    return res.status(500).json({
      success: false,
      message: "Failed to add flyer image",
      error: error.message,
    });
  }
};

// ============================================================
// UPDATE ONE FLYER
//
// Can:
// - replace image
// - update imageSettings
// - do both
// ============================================================

const updateFlyerImage = async (req, res) => {
  let uploadedPublicId = null;

  try {
    const { id, flyerId } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid image ID",
      });
    }

    if (!isValidObjectId(flyerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid flyer ID",
      });
    }

    const image = await Image.findById(id);

    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    const flyerItem = image.flyer.id(flyerId);

    if (!flyerItem) {
      return res.status(404).json({
        success: false,
        message: "Flyer image not found",
      });
    }

    // ========================================================
    // REPLACE IMAGE
    // ========================================================

    if (req.file) {
      const oldPublicId = flyerItem.publicId;

      try {
        const result = await uploadToCloudinary(req.file.path, "menupio/flyer");

        uploadedPublicId = result.public_id;

        flyerItem.image = result.secure_url;
        flyerItem.publicId = result.public_id;

        await image.save();

        // Only delete old Cloudinary image after DB save
        if (oldPublicId) {
          await deleteFromCloudinary(oldPublicId);
        }
      } finally {
        await deleteLocalFile(req.file.path);
      }
    }

    // ========================================================
    // UPDATE IMAGE SETTINGS
    // ========================================================

    if (req.body.imageSettings) {
      let imageSettings;

      try {
        imageSettings =
          typeof req.body.imageSettings === "string"
            ? JSON.parse(req.body.imageSettings)
            : req.body.imageSettings;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid imageSettings JSON",
        });
      }

      if (
        typeof imageSettings !== "object" ||
        Array.isArray(imageSettings) ||
        imageSettings === null
      ) {
        return res.status(400).json({
          success: false,
          message: "imageSettings must be an object",
        });
      }

      Object.assign(flyerItem.imageSettings, imageSettings);

      await image.save();
    }

    return res.status(200).json({
      success: true,
      message: "Flyer image updated successfully",
      data: image,
    });
  } catch (error) {
    console.error("updateFlyerImage error:", error);

    if (uploadedPublicId) {
      await deleteFromCloudinary(uploadedPublicId);
    }

    if (req.file?.path) {
      await deleteLocalFile(req.file.path);
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update flyer image",
      error: error.message,
    });
  }
};

// ============================================================
// DELETE ONE FLYER
// ============================================================

const deleteFlyerImage = async (req, res) => {
  try {
    const { id, flyerId } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid image ID",
      });
    }

    if (!isValidObjectId(flyerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid flyer ID",
      });
    }

    const image = await Image.findById(id);

    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    const flyerItem = image.flyer.id(flyerId);

    if (!flyerItem) {
      return res.status(404).json({
        success: false,
        message: "Flyer image not found",
      });
    }

    const publicId = flyerItem.publicId;

    image.flyer.pull(flyerId);

    await image.save();

    // Delete Cloudinary image AFTER MongoDB succeeds
    if (publicId) {
      await deleteFromCloudinary(publicId);
    }

    return res.status(200).json({
      success: true,
      message: "Flyer image deleted successfully",
      data: image,
    });
  } catch (error) {
    console.error("deleteFlyerImage error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete flyer image",
      error: error.message,
    });
  }
};

// ============================================================
// DELETE BACKGROUND
// ============================================================

const deleteBackground = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid image ID",
      });
    }

    const image = await Image.findById(id);

    if (!image) {
      return res.status(404).json({
        success: false,
        message: "Image not found",
      });
    }

    /*
     * Your schema stores background as:
     *
     * background: String
     *
     * There is no Cloudinary publicId.
     *
     * So we can remove the MongoDB reference,
     * but we cannot safely remove the Cloudinary file.
     */

    image.background = "";

    await image.save();

    return res.status(200).json({
      success: true,
      message: "Background removed successfully",
      data: image,
    });
  } catch (error) {
    console.error("deleteBackground error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete background",
      error: error.message,
    });
  }
};
// ============================================================
// FIND EXISTING IMAGE DOCUMENT FOR A SITE ITEM
// ============================================================

const parseJson = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    console.error("parseJson error:", error);

    return fallback;
  }
};

const findExistingImageDocument = async (siteItem) => {
  if (!siteItem) {
    return null;
  }

  const imageReferences = Array.isArray(siteItem.images)
    ? siteItem.images
    : siteItem.images
      ? [siteItem.images]
      : [];

  const imageIds = imageReferences
    .map((value) => {
      if (!value) {
        return null;
      }

      if (typeof value === "object") {
        return value?._id || value?.id || null;
      }

      return value;
    })
    .filter((value) => mongoose.isValidObjectId(value));

  if (imageIds.length === 0) {
    return null;
  }

  const imageDocuments = await Image.find({
    _id: {
      $in: imageIds,
    },
  });

  if (!imageDocuments.length) {
    return null;
  }

  const documentMap = new Map(
    imageDocuments.map((document) => [String(document._id), document]),
  );

  /*
   * Use the last valid image reference from SiteItem.image.
   * This treats the most recently attached Image document
   * as the current image document.
   */
  for (let index = imageIds.length - 1; index >= 0; index--) {
    const document = documentMap.get(String(imageIds[index]));

    if (document) {
      return document;
    }
  }

  return null;
};

// ============================================================
// CREATE / UPDATE SITE ITEM IMAGE
// ============================================================

const createSiteItemImage = async (req, res) => {
  const uploadedCloudinaryIds = [];

  const flyerFiles = req.files?.flyer || [];

  const backgroundFile = req.files?.background?.[0];

  try {
    const { id } = req.params;

    // ========================================================
    // VALIDATE SITE ITEM
    // ========================================================

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid SiteItem ID",
      });
    }

    const siteItem = await SiteItem.findById(id);

    if (!siteItem) {
      return res.status(404).json({
        success: false,
        message: "SiteItem not found",
      });
    }

    // ========================================================
    // FIND EXISTING IMAGE DOCUMENT
    // ========================================================

    let imageDocument = await findExistingImageDocument(siteItem);

    const isUpdating = !!imageDocument;

    // ========================================================
    // READ FLYER DATA
    // ========================================================
    //
    // Frontend sends:
    //
    // flyerData: [
    //   {
    //     id,
    //     itemId,
    //     image,
    //     publicId,
    //     fileIndex,
    //     imageSettings: {
    //       h,
    //       w,
    //       translateX,
    //       translateY,
    //       rotate,
    //       zIndex,
    //       opacity
    //     }
    //   }
    // ]
    //
    // This allows:
    //
    // existing Cloudinary images
    // +
    // newly uploaded images
    //
    // ========================================================

    const flyerData = parseJson(req.body.flyerData, []);

    const normalizedFlyerData = Array.isArray(flyerData) ? flyerData : [];

    // ========================================================
    // UPLOAD NEW FLYER FILES
    // ========================================================

    const uploadedFlyers = {};

    for (let index = 0; index < flyerFiles.length; index++) {
      const file = flyerFiles[index];

      try {
        const result = await uploadToCloudinary(file.path, "menupio/flyer");

        uploadedCloudinaryIds.push(result.public_id);

        uploadedFlyers[index] = {
          image: result.secure_url,
          publicId: result.public_id,
        };
      } finally {
        await deleteLocalFile(file.path);
      }
    }

    // ========================================================
    // BUILD FLYER ARRAY
    // ========================================================

    const flyer = [];

    for (let index = 0; index < normalizedFlyerData.length; index++) {
      const flyerDataItem = normalizedFlyerData[index];

      if (!flyerDataItem) {
        continue;
      }

      // ------------------------------------------------------
      // FILE UPLOAD
      // ------------------------------------------------------

      const fileIndex = flyerDataItem.fileIndex;

      const uploadedFile =
        fileIndex !== null && fileIndex !== undefined
          ? uploadedFlyers[Number(fileIndex)]
          : null;

      // ------------------------------------------------------
      // IMAGE
      // ------------------------------------------------------

      const image = uploadedFile?.image || flyerDataItem.image || "";

      const publicId = uploadedFile?.publicId || flyerDataItem.publicId || "";

      if (!image) {
        continue;
      }

      // ------------------------------------------------------
      // SETTINGS
      // ------------------------------------------------------

      const settings = flyerDataItem.imageSettings || {};

      flyer.push({
        image,

        /*
         * Required by Image schema.
         *
         * Existing Cloudinary images must provide
         * their existing publicId.
         *
         * New uploads receive publicId from Cloudinary.
         */
        publicId,

        imageSettings: {
          h: settings.h || "105%",

          w: settings.w || "105%",

          translateX: settings.translateX || "14%",

          translateY: settings.translateY || "2%",

          rotate: settings.rotate || "0deg",

          zIndex: Number.isFinite(Number(settings.zIndex))
            ? Number(settings.zIndex)
            : index + 1,

          opacity: Number.isFinite(Number(settings.opacity))
            ? Number(settings.opacity)
            : 1,
        },
      });
    }

    // ========================================================
    // BACKGROUND
    // ========================================================

    let background = imageDocument?.background || req.body.background || "";

    if (backgroundFile) {
      try {
        const result = await uploadToCloudinary(
          backgroundFile.path,
          "menupio/background",
        );

        uploadedCloudinaryIds.push(result.public_id);

        background = result.secure_url;
      } finally {
        await deleteLocalFile(backgroundFile.path);
      }
    }

    // ========================================================
    // REMOVE BACKGROUND
    // ========================================================

    if (req.body.removeBackground === "true") {
      background = "";
    }

    // ========================================================
    // CREATE OR UPDATE IMAGE
    // ========================================================

    if (imageDocument) {
      imageDocument.flyer = flyer;

      imageDocument.background = background;

      await imageDocument.save();
    } else {
      imageDocument = await Image.create({
        flyer,
        background,
      });
    }

    // ========================================================
    // PUSH IMAGE ID INTO SITE ITEM
    // ========================================================

    const imageDocumentId = imageDocument._id;

    if (!Array.isArray(siteItem.images)) {
      siteItem.images = [];
    }

    const alreadyExists = siteItem.images.some((value) => {
      const valueId =
        typeof value === "object" ? value?._id || value?.id : value;

      return (
        mongoose.isValidObjectId(valueId) &&
        String(valueId) === String(imageDocumentId)
      );
    });

    if (!alreadyExists) {
      siteItem.images.push(imageDocumentId);
    }

    // ========================================================
    // IMPORTANT:
    // ALWAYS SAVE THE SITE ITEM AFTER UPDATING image[]
    // ========================================================

    await siteItem.save();

    // ========================================================
    // RESPONSE
    // ========================================================

    const populatedSiteItem = await SiteItem.findById(siteItem._id).lean();

    return res.status(isUpdating ? 200 : 201).json({
      success: true,

      message: isUpdating
        ? "SiteItem image updated successfully"
        : "SiteItem image created successfully",

      data: {
        image: imageDocument,
        siteItem: populatedSiteItem,
      },
    });
  } catch (error) {
    console.error("createSiteItemImage error:", error);

    // ========================================================
    // ROLLBACK CLOUDINARY UPLOADS
    // ========================================================

    for (const publicId of uploadedCloudinaryIds) {
      try {
        await deleteFromCloudinary(publicId);
      } catch (rollbackError) {
        console.error("Cloudinary rollback error:", rollbackError);
      }
    }

    // ========================================================
    // CLEAN LOCAL FILES
    // ========================================================

    for (const file of flyerFiles) {
      try {
        await deleteLocalFile(file.path);
      } catch {
        // Ignore cleanup errors.
      }
    }

    if (backgroundFile) {
      try {
        await deleteLocalFile(backgroundFile.path);
      } catch {
        // Ignore cleanup errors.
      }
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create/update SiteItem image",
      error: error.message,
    });
  }
};
const getSiteItemImage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid SiteItem ID",
      });
    }

    const siteItem = await SiteItem.findById(id).lean();

    if (!siteItem) {
      return res.status(404).json({
        success: false,
        message: "SiteItem not found",
      });
    }

    /*
     * SiteItem.image can contain:
     *
     * [
     *   "https://cloudinary.com/...",
     *   ObjectId("...")
     * ]
     *
     * Find the Image document referenced by it.
     */

    let imageDocument = null;

    if (Array.isArray(siteItem.images)) {
      for (const imageValue of siteItem.images) {
        if (!mongoose.isValidObjectId(imageValue)) {
          continue;
        }

        const found = await Image.findById(imageValue).lean();

        if (found) {
          imageDocument = found;
          break;
        }
      }
    }

    /*
     * No Image document is perfectly valid.
     *
     * This means the frontend should open an empty
     * editor and create the Image on first save.
     */

    if (!imageDocument) {
      return res.status(200).json({
        success: true,
        exists: false,
        image: null,
        siteItem: {
          _id: siteItem._id,
          name: siteItem.name,
        },
      });
    }

    return res.status(200).json({
      success: true,
      exists: true,
      image: imageDocument,
      siteItem: {
        _id: siteItem._id,
        name: siteItem.name,
      },
    });
  } catch (error) {
    console.error("GET SITE ITEM IMAGE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load SiteItem image",
      error: error.message,
    });
  }
};
// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getImages,
  getSiteItemImage,
  getImageById,
  createImage,
  updateImage,
  deleteImage,
  createSiteItemImage,
  addFlyerImage,
  updateFlyerImage,
  deleteFlyerImage,
  deleteBackground,
};
