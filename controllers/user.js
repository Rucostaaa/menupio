const User = require("../models/User");
const bcrypt = require("bcryptjs");

// ============================================================
// UPDATE USER SCHEDULE
// ============================================================

const updateUserSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { schedule } = req.body;

    // ==========================================================
    // VALIDATE SCHEDULE
    // ==========================================================

    if (!schedule || typeof schedule !== "object") {
      return res.status(400).json({
        success: false,
        message: "Schedule is required.",
      });
    }

    // ==========================================================
    // VALID DAYS
    // ==========================================================

    const days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];

    // ==========================================================
    // TIME VALIDATION
    // ==========================================================

    const isValidTime = (time) => {
      return (
        typeof time === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(time)
      );
    };

    const timeToMinutes = (time) => {
      const [hours, minutes] = time.split(":").map(Number);

      return hours * 60 + minutes;
    };

    // ==========================================================
    // VALIDATE EACH DAY
    // ==========================================================

    for (const day of days) {
      const daySettings = schedule[day];

      if (!daySettings) {
        return res.status(400).json({
          success: false,
          message: `Missing schedule for ${day}.`,
        });
      }

      const enabled =
        typeof daySettings.enabled === "boolean" ? daySettings.enabled : true;

      // --------------------------------------------------------
      // CLOSED DAY
      // --------------------------------------------------------

      if (!enabled) {
        continue;
      }

      // --------------------------------------------------------
      // OPEN / CLOSE
      // --------------------------------------------------------

      if (
        !isValidTime(daySettings.startTime) ||
        !isValidTime(daySettings.endTime)
      ) {
        return res.status(400).json({
          success: false,
          message: `Invalid opening hours for ${day}.`,
        });
      }

      const startMinutes = timeToMinutes(daySettings.startTime);

      const endMinutes = timeToMinutes(daySettings.endTime);

      if (endMinutes <= startMinutes) {
        return res.status(400).json({
          success: false,
          message: `Closing time must be after opening time for ${day}.`,
        });
      }

      // --------------------------------------------------------
      // BREAKS
      // --------------------------------------------------------

      const breaks = Array.isArray(daySettings.breaks)
        ? daySettings.breaks
        : [];

      for (const breakItem of breaks) {
        if (!isValidTime(breakItem.start) || !isValidTime(breakItem.end)) {
          return res.status(400).json({
            success: false,
            message: `Invalid break time for ${day}.`,
          });
        }

        const breakStart = timeToMinutes(breakItem.start);

        const breakEnd = timeToMinutes(breakItem.end);

        if (breakEnd <= breakStart) {
          return res.status(400).json({
            success: false,
            message: `Break end must be after break start for ${day}.`,
          });
        }

        if (breakStart < startMinutes || breakEnd > endMinutes) {
          return res.status(400).json({
            success: false,
            message: `Break must be inside working hours for ${day}.`,
          });
        }
      }
    }

    // ==========================================================
    // FIND USER
    // ==========================================================

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // ==========================================================
    // SAVE
    // ==========================================================

    user.schedule = {
      monday: schedule.monday,
      tuesday: schedule.tuesday,
      wednesday: schedule.wednesday,
      thursday: schedule.thursday,
      friday: schedule.friday,
      saturday: schedule.saturday,
      sunday: schedule.sunday,
    };

    await user.save();

    // ==========================================================
    // RESPONSE
    // ==========================================================

    return res.status(200).json({
      success: true,
      message: "Schedule updated successfully.",
      schedule: user.schedule,
    });
  } catch (error) {
    console.error("UPDATE USER SCHEDULE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update schedule.",
    });
  }
};
const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;

    const { name, email } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required.",
      });
    }

    if (!email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    user.name = name.trim();
    user.email = email.trim().toLowerCase();

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user,
    });
  } catch (error) {
    console.error("UPDATE PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update profile.",
    });
  }
};

const updatePassword = async (req, res) => {
  try {
    const userId = req.user._id;

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters.",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Check the current password
    const isCorrect = await user.comparePassword(currentPassword);

    if (!isCorrect) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    // Don't hash here.
    // The User pre("save") hook will hash it.
    user.password = newPassword;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (error) {
    console.error("UPDATE PASSWORD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update password.",
    });
  }
};

module.exports = {
  updateUserSchedule,
  updateProfile,
  updatePassword,
};
