import { Request, Response, NextFunction } from "express";
import Responsibility from "../models/responsibility.model";
import Category from "../models/category.model";

const DEFAULT_RESPONSIBILITIES = [
  { key: "salesManager", label: "Sales manager" },
  { key: "presalesEngineer", label: "Presales engineer" },
  { key: "operationsUser", label: "Operations user" },
  { key: "financeApprover", label: "Finance approver" },
  { key: "inventoryUser", label: "Inventory user" },
];

// Turns a label into a stable camelCase key, e.g. "Procurement buyer" -> "procurementBuyer".
const toKey = (label: string): string =>
  label
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join("");

export const getResponsibilities = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // First use: seed the defaults that used to be hardcoded on the role form.
    if ((await Responsibility.countDocuments()) === 0) {
      await Responsibility.insertMany(DEFAULT_RESPONSIBILITIES);
    }
    const list = await Responsibility.find({ isDeleted: { $ne: true } }).sort({ label: 1 });
    return res.status(200).json(list);
  } catch (error) {
    next(error);
  }
};

export const createResponsibility = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const label = String(req.body.label ?? "").trim();
    if (!label) return res.status(400).json("Label is required");
    const key = toKey(label);
    if (!key) return res.status(400).json("Label must contain letters or numbers");

    const existing = await Responsibility.findOne({ key });
    if (existing) {
      return res.status(400).json(existing.isDeleted ? "This responsibility was deleted earlier. Choose a different name." : "Responsibility already exists");
    }

    const created = await Responsibility.create({ key, label, description: req.body.description });
    return res.status(200).json(created);
  } catch (error) {
    next(error);
  }
};

export const updateResponsibility = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { label, description, isActive } = req.body;
    const updated = await Responsibility.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      { label, description, isActive },
      { new: true, omitUndefined: true }
    );
    if (!updated) return res.status(404).json({ message: "Responsibility not found" });
    return res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteResponsibility = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const responsibility = await Responsibility.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!responsibility) return res.status(404).json({ message: "Responsibility not found" });

    const inUse = await Category.countDocuments({ isDeleted: { $ne: true }, responsibilities: responsibility.key });
    if (inUse > 0) {
      return res.status(400).json({ message: `Used by ${inUse} role(s). Remove it from them, or deactivate it instead.` });
    }

    responsibility.isDeleted = true;
    await responsibility.save();
    return res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};
