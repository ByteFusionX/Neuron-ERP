import { Response, NextFunction } from "express";
import * as bcrypt from "bcrypt";
import fs from "fs";
import Employee from "../models/employee.model";
import { uploadFileToAws, getFileUrlFromAws, deleteFileFromAws } from "../common/aws-connect";

// Every handler here acts on req.employee (set by attachEmployee from the verified token),
// never on an id taken from the request, so a user can only ever touch their own record.

const DATE_FORMATS = ["dd-MM-yyyy", "MM-dd-yyyy", "yyyy-MM-dd", "dd MMM yyyy"];
const LANGUAGES = ["en"];
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PASSWORD_MIN = 8;

const isValidTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const cleanupUpload = (file?: { path?: string }) => {
  if (file?.path) fs.unlink(file.path, () => undefined);
};

export const getMyProfile = async (req: any, res: Response, next: NextFunction) => {
  try {
    const me = req.employee;
    if (!me) return res.status(401).json({ message: "Unauthorized" });

    const employee = await Employee.findById(me._id)
      .populate("department", "departmentName")
      .populate("reportingTo", "firstName lastName designation")
      .populate("category", "role privileges");
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const expiresAt = employee.extraPrivilegesExpiresAt ?? null;
    const extraExpired = !!expiresAt && new Date(expiresAt).getTime() <= Date.now();

    return res.status(200).json({
      _id: employee._id,
      employeeId: employee.employeeId,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      contactNo: employee.contactNo,
      dob: employee.dob,
      photo: employee.photo ? await getFileUrlFromAws(employee.photo) : null,
      employment: {
        designation: employee.designation,
        department: (employee.department as any)?.departmentName ?? null,
        reportingTo: employee.reportingTo
          ? {
              name: `${(employee.reportingTo as any).firstName} ${(employee.reportingTo as any).lastName}`,
              designation: (employee.reportingTo as any).designation,
            }
          : null,
        dateOfJoining: employee.dateOfJoining,
        contractType: employee.contractType ?? null,
        contractStart: employee.contractStart ?? null,
        contractEnd: employee.contractEnd ?? null,
        probationEnd: employee.probationEnd ?? null,
        approvalLimit: employee.approvalLimit ?? null,
        isTechnician: !!employee.isTechnician,
        isDriver: !!employee.isDriver,
        isProjectManager: !!employee.isProjectManager,
      },
      role: (employee.category as any)?.role ?? null,
      access: {
        privileges: (employee.category as any)?.privileges ?? {},
        extraPrivileges: employee.extraPrivileges ?? {},
        extraPrivilegesExpiresAt: expiresAt,
        extraPrivilegesExpired: extraExpired,
      },
      targets: employee.targets ?? [],
      preferences: employee.preferences ?? {},
      security: {
        lastLoginAt: employee.lastLoginAt ?? null,
        passwordChangedAt: employee.passwordChangedAt ?? null,
        microsoftLinked: !!employee.microsoftId,
      },
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
};

// Name, phone and personal preferences only. Employment, role and access fields are HR-owned
// and stay behind the employee edit privilege.
export const updateMyProfile = async (req: any, res: Response, next: NextFunction) => {
  try {
    const me = req.employee;
    if (!me) return res.status(401).json({ message: "Unauthorized" });

    const { firstName, lastName, contactNo, preferences } = req.body ?? {};
    const set: Record<string, any> = {};

    if (firstName !== undefined) {
      if (typeof firstName !== "string" || !firstName.trim() || firstName.trim().length > 50) {
        return res.status(400).json({ message: "First name is required (max 50 characters)" });
      }
      set.firstName = firstName.trim();
    }
    if (lastName !== undefined) {
      if (typeof lastName !== "string" || !lastName.trim() || lastName.trim().length > 50) {
        return res.status(400).json({ message: "Last name is required (max 50 characters)" });
      }
      set.lastName = lastName.trim();
    }
    if (contactNo !== undefined) {
      const digits = String(contactNo).replace(/[\s()+-]/g, "");
      if (!/^\d{6,15}$/.test(digits)) {
        return res.status(400).json({ message: "Phone number must be 6 to 15 digits" });
      }
      set.contactNo = Number(digits);
    }

    if (preferences !== undefined) {
      if (typeof preferences !== "object" || preferences === null) {
        return res.status(400).json({ message: "Invalid preferences" });
      }
      const { defaultLandingPage, dateFormat, timezone, language } = preferences;
      if (defaultLandingPage !== undefined) {
        if (typeof defaultLandingPage !== "string" || (defaultLandingPage && !/^\/[A-Za-z0-9\-_/]{0,100}$/.test(defaultLandingPage))) {
          return res.status(400).json({ message: "Invalid landing page" });
        }
        set["preferences.defaultLandingPage"] = defaultLandingPage;
      }
      if (dateFormat !== undefined) {
        if (dateFormat && !DATE_FORMATS.includes(dateFormat)) {
          return res.status(400).json({ message: "Unsupported date format" });
        }
        set["preferences.dateFormat"] = dateFormat;
      }
      if (timezone !== undefined) {
        if (timezone && (typeof timezone !== "string" || !isValidTimezone(timezone))) {
          return res.status(400).json({ message: "Unknown timezone" });
        }
        set["preferences.timezone"] = timezone;
      }
      if (language !== undefined) {
        if (language && !LANGUAGES.includes(language)) {
          return res.status(400).json({ message: "Unsupported language" });
        }
        set["preferences.language"] = language;
      }
    }

    if (!Object.keys(set).length) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const updated = await Employee.findByIdAndUpdate(me._id, { $set: set }, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: "Employee not found" });

    return res.status(200).json({
      firstName: updated.firstName,
      lastName: updated.lastName,
      contactNo: updated.contactNo,
      preferences: updated.preferences ?? {},
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
};

export const changeMyPassword = async (req: any, res: Response, next: NextFunction) => {
  try {
    const me = req.employee;
    if (!me) return res.status(401).json({ message: "Unauthorized" });

    const { oldPassword, newPassword } = req.body ?? {};
    if (typeof oldPassword !== "string" || typeof newPassword !== "string" || !oldPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }
    if (newPassword.length < PASSWORD_MIN || newPassword.length > 128) {
      return res.status(400).json({ message: `New password must be ${PASSWORD_MIN} to 128 characters` });
    }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return res.status(400).json({ message: "New password must contain at least one letter and one number" });
    }
    if (newPassword === oldPassword) {
      return res.status(400).json({ message: "New password must be different from the current one" });
    }

    const user = await Employee.findById(me._id).select("+password");
    if (!user) return res.status(404).json({ message: "Employee not found" });
    if (!user.password) {
      return res.status(400).json({ message: "This account has no password set. Sign in with Microsoft instead." });
    }

    // Same rule as /login: bcrypt hashes, plus plaintext values set by hand in MongoDB.
    const isBcryptHash = /^\$2[aby]\$\d{2}\$/.test(user.password);
    const matches = isBcryptHash ? await bcrypt.compare(oldPassword, user.password) : oldPassword === user.password;
    if (!matches) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await Employee.updateOne({ _id: user._id }, { $set: { password: hashed, passwordChangedAt: new Date() } });
    return res.status(200).json({ passwordChanged: true });
  } catch (error) {
    console.log(error);
    next(error);
  }
};

export const uploadMyPhoto = async (req: any, res: Response, next: NextFunction) => {
  const file = req.file;
  try {
    const me = req.employee;
    if (!me) {
      cleanupUpload(file);
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!file) return res.status(400).json({ message: "No file uploaded" });
    if (!PHOTO_TYPES.includes(file.mimetype)) {
      cleanupUpload(file);
      return res.status(400).json({ message: "Photo must be a JPG, PNG or WebP image" });
    }
    if (file.size > PHOTO_MAX_BYTES) {
      cleanupUpload(file);
      return res.status(400).json({ message: "Photo must be 2 MB or smaller" });
    }

    await uploadFileToAws(file.filename, file.path);
    await Employee.updateOne({ _id: me._id }, { $set: { photo: file.filename } });
    cleanupUpload(file);

    return res.status(200).json({ success: true, photo: await getFileUrlFromAws(file.filename) });
  } catch (error) {
    cleanupUpload(file);
    console.log(error);
    next(error);
  }
};

export const removeMyPhoto = async (req: any, res: Response, next: NextFunction) => {
  try {
    const me = req.employee;
    if (!me) return res.status(401).json({ message: "Unauthorized" });

    const previous = me.photo;
    await Employee.updateOne({ _id: me._id }, { $unset: { photo: "" } });
    if (previous) {
      // The record is already updated; a failed bucket cleanup must not fail the request.
      deleteFileFromAws(previous).catch((err) => console.log(err));
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.log(error);
    next(error);
  }
};
