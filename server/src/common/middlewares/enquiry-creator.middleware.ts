import { Response, NextFunction } from "express";
import { Types } from "mongoose";
import enquiryModel from "../../models/enquiry.model";

// Editing an enquiry's attachments is only open while the enquiry is still with sales.
const EDITABLE_STATUSES = ["new", "in progress", "work in progress", "lost", "rejected"];

export const isEnquiryEditableStatus = (status: any) => EDITABLE_STATUSES.includes(String(status || "").toLowerCase());

const isAdminRole = (employee: any) => /^superadmin$/i.test(String(employee?.category?.role ?? ''));

/**
 * Only the person who created the enquiry (its owner or the user who raised it for them) may work it; not even
 * their manager or an admin. superAdmin keeps an override so an enquiry is never stranded when its creator leaves.
 * Reads the enquiry id from the route, then falls back to the body.
 */
export const requireEnquiryCreator = (options: { editableStatusOnly?: boolean } = {}) => {
  return async (req: any, res: Response, next: NextFunction) => {
    const employee = req.employee;
    if (!employee) return res.status(401).json({ message: "Unauthorized" });

    const enquiryId = req.params?.enquiryId || req.body?.id || req.body?.enquiryId;
    if (!enquiryId || !Types.ObjectId.isValid(enquiryId)) return res.status(400).json({ success: false, message: "Invalid enquiry id" });

    try {
      const enquiry: any = await enquiryModel.findById(enquiryId).select("salesPerson createdByUser status").lean();
      if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found" });

      if (!isAdminRole(employee)) {
        const me = employee._id?.toString();
        const isCreator = [enquiry.salesPerson, enquiry.createdByUser].some((id: any) => id && id.toString() === me);
        if (!isCreator) {
          return res.status(403).json({ success: false, message: "Only the person who created this enquiry can change it" });
        }
      }

      if (options.editableStatusOnly && !isEnquiryEditableStatus(enquiry.status)) {
        return res.status(400).json({ success: false, message: "This enquiry can only be edited while it is new, in progress, lost or rejected" });
      }
      return next();
    } catch (error) {
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
};
