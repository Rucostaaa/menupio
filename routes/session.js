const router = require("express").Router();

const {
  getAllSessions,
  createSession,
  deleteManySessions,
  advertClicked,
  createOrder,
  getSingleSession,
  updateSession,
  deleteSession,
  getAdverts,
} = require("../controllers/session");
const auth = require("../middleware/auth");

router
  .route("/")
  .get(auth, getAllSessions)
  .post(createSession)
  .delete(auth, deleteManySessions);
router.get("/adverts", getAdverts);

router.patch("/click-advert/:advertId", auth, advertClicked);
router.patch("/purchase/:advertId", auth, createOrder);
router
  .route("/:sessionId")
  .get(auth, getSingleSession)
  .patch(auth, updateSession)
  .delete(deleteSession);

module.exports = router;
