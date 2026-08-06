const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: String,

    email: {
      type: String,
      unique: true,
      required: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    role: {
      type: String,
      enum: ["customer", "user", "admin"],
      default: "user",
    },
  },
  {
    timestamps: true,
  },
);

/*
|--------------------------------------------------------------------------
| HASH PASSWORD BEFORE SAVE (FIXED)
|--------------------------------------------------------------------------
*/
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
});

/*
|--------------------------------------------------------------------------
| COMPARE PASSWORD METHOD
|--------------------------------------------------------------------------
*/
userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("User", userSchema);
