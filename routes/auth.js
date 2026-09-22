const router = require("express").Router();

const { register, login, getCurrentUser } = require("../controllers/auth");
const auth = require("../middleware/auth");

router.post("/register", register);
router.post("/login", login);
router.get("/me", auth, getCurrentUser);

module.exports = router;
