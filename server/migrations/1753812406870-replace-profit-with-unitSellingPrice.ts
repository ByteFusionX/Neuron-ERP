import mongoose from 'mongoose';
import { connectToDatabase } from '../src/db/connect';

export async function up(): Promise<void> {
  await connectToDatabase();
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Failed to connect to MongoDB');
  }
  const db = mongoose.connection.db;
  const enquiryCollection = db.collection('enquiries');
  const enquiries = await enquiryCollection.find({
    'preSale.estimations.optionalItems': { $exists: true, $ne: [] }
  }).toArray();
  let updatedEnquiries = 0;
  for (const enquiry of enquiries) {
    let hasChanges = false;
    if (enquiry.preSale?.estimations?.optionalItems) {
      for (const optionalItem of enquiry.preSale.estimations.optionalItems) {
        if (optionalItem.items && Array.isArray(optionalItem.items)) {
          for (const item of optionalItem.items) {
            if (item.itemDetails && Array.isArray(item.itemDetails)) {
              for (const detail of item.itemDetails) {
                if (detail.profit !== undefined && detail.unitCost !== undefined) {
                  const decimalMargin = detail.profit / 100;
                  detail.unitSellingPrice = Math.ceil(Number((detail.unitCost / (1 - decimalMargin)).toFixed(2)));
                  delete detail.profit;
                  hasChanges = true;
                }
                if (detail.unitPrice !== undefined) {
                  delete detail.unitPrice;
                  hasChanges = true;
                }
              }
            }
          }
        }
      }
    }
    if (hasChanges) {
      await enquiryCollection.updateOne(
        { _id: enquiry._id },
        { $set: { 'preSale.estimations.optionalItems': enquiry.preSale.estimations.optionalItems } }
      );
      updatedEnquiries++;
    }
  }
}

export async function down(): Promise<void> {
  await connectToDatabase();
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Failed to connect to MongoDB');
  }
  const db = mongoose.connection.db;
  const enquiryCollection = db.collection('enquiries');
  const enquiries = await enquiryCollection.find({
    'preSale.estimations.optionalItems': { $exists: true, $ne: [] }
  }).toArray();
  let revertedEnquiries = 0;
  for (const enquiry of enquiries) {
    let hasChanges = false;
    if (enquiry.preSale?.estimations?.optionalItems) {
      for (const optionalItem of enquiry.preSale.estimations.optionalItems) {
        if (optionalItem.items && Array.isArray(optionalItem.items)) {
          for (const item of optionalItem.items) {
            if (item.itemDetails && Array.isArray(item.itemDetails)) {
              for (const detail of item.itemDetails) {
                if (detail.unitSellingPrice !== undefined && detail.unitCost !== undefined) {
                  // Reverse calculation is not possible without original profit, so just set profit to 0
                  detail.profit = 0;
                  delete detail.unitSellingPrice;
                  hasChanges = true;
                }
                // Note: unitPrice cannot be restored as it was deleted
              }
            }
          }
        }
      }
    }
    if (hasChanges) {
      await enquiryCollection.updateOne(
        { _id: enquiry._id },
        { $set: { 'preSale.estimations.optionalItems': enquiry.preSale.estimations.optionalItems } }
      );
      revertedEnquiries++;
    }
  }
} 