import mongoose from 'mongoose';
import { connectToDatabase } from '../src/db/connect';

export async function up(): Promise<void> {
  await connectToDatabase();
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Failed to connect to MongoDB');
  }
  const db = mongoose.connection.db;
  const quotationCollection = db.collection('quotations');
  
  console.log('Starting migration: replace profit with unitSellingPrice in quotations');
  
  const quotations = await quotationCollection.find({}).toArray();
  let updatedQuotations = 0;
  
  for (const quotation of quotations) {
    let quotationHasChanges = false;
    let dealDataHasChanges = false;
    
    // Update optionalItems
    if (quotation.optionalItems && Array.isArray(quotation.optionalItems)) {
      for (const optionalItem of quotation.optionalItems) {
        if (optionalItem.items && Array.isArray(optionalItem.items)) {
          for (const item of optionalItem.items) {
            if (item.itemDetails && Array.isArray(item.itemDetails)) {
              for (const detail of item.itemDetails) {
                if (detail.profit !== undefined && detail.unitCost !== undefined) {
                  const decimalMargin = detail.profit / 100;
                  detail.unitSellingPrice = Math.ceil(Number((detail.unitCost / (1 - decimalMargin)).toFixed(2)));
                  delete detail.profit;
                  quotationHasChanges = true;
                }
              }
            }
          }
        }
      }
    }
    
    // Update dealData.updatedItems
    if (quotation.dealData?.updatedItems && Array.isArray(quotation.dealData.updatedItems)) {
      for (const item of quotation.dealData.updatedItems) {
        if (item.itemDetails && Array.isArray(item.itemDetails)) {
          for (const detail of item.itemDetails) {
            if (detail.profit !== undefined && detail.unitCost !== undefined) {
              const decimalMargin = detail.profit / 100;
              detail.unitSellingPrice = Math.ceil(Number((detail.unitCost / (1 - decimalMargin)).toFixed(2)));
              delete detail.profit;
              dealDataHasChanges = true;
            }
          }
        }
      }
    }
    
    if (quotationHasChanges) {
      await quotationCollection.updateOne(
        { _id: quotation._id },
        { $set: { 
          optionalItems: quotation.optionalItems,
        }}
      );
    }else if(dealDataHasChanges){
      await quotationCollection.updateOne(
        { _id: quotation._id },
        { $set: { 
          'dealData.updatedItems': quotation.dealData?.updatedItems 
        }}
      );
    }

    if (quotationHasChanges || dealDataHasChanges) {
      updatedQuotations++;
    }
  }
  
  console.log(`Updated ${updatedQuotations} quotations`);
  console.log('Migration completed successfully!');
}

export async function down(): Promise<void> {
  await connectToDatabase();
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Failed to connect to MongoDB');
  }
  const db = mongoose.connection.db;
  const quotationCollection = db.collection('quotations');
  
  console.log('Reverting migration: replace unitSellingPrice with profit in quotations');
  
  const quotations = await quotationCollection.find({}).toArray();
  let revertedQuotations = 0;
  
  for (const quotation of quotations) {
    let hasChanges = false;
    
    // Revert optionalItems
    if (quotation.optionalItems && Array.isArray(quotation.optionalItems)) {
      for (const optionalItem of quotation.optionalItems) {
        if (optionalItem.items && Array.isArray(optionalItem.items)) {
          for (const item of optionalItem.items) {
            if (item.itemDetails && Array.isArray(item.itemDetails)) {
              for (const detail of item.itemDetails) {
                if (detail.unitSellingPrice !== undefined && detail.unitCost !== undefined) {
                  detail.profit = 0; // Cannot restore original profit, so set to 0
                  delete detail.unitSellingPrice;
                  hasChanges = true;
                }
              }
            }
          }
        }
      }
    }
    
    // Revert dealData.updatedItems
    if (quotation.dealData?.updatedItems && Array.isArray(quotation.dealData.updatedItems)) {
      for (const item of quotation.dealData.updatedItems) {
        if (item.itemDetails && Array.isArray(item.itemDetails)) {
          for (const detail of item.itemDetails) {
            if (detail.unitSellingPrice !== undefined && detail.unitCost !== undefined) {
              detail.profit = 0; // Cannot restore original profit, so set to 0
              delete detail.unitSellingPrice;
              hasChanges = true;
            }
          }
        }
      }
    }
    
    if (hasChanges) {
      await quotationCollection.updateOne(
        { _id: quotation._id },
        { $set: { 
          optionalItems: quotation.optionalItems,
          'dealData.updatedItems': quotation.dealData?.updatedItems 
        }}
      );
      revertedQuotations++;
    }
  }
  
  console.log(`Reverted ${revertedQuotations} quotations`);
  console.log('Down migration completed!');
}
