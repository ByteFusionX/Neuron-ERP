import quotationModel from "../src/models/quotation.model";
import { connectToDatabase } from '../src/db/connect';


export async function up(): Promise<void> {
  await connectToDatabase();

  await quotationModel.updateMany(
    {
      items: { $exists: true },
      dealData: { $exists: true }
    },
    [
      {
        $set: {
          "dealData.totalDiscount": {
            $ifNull: ["$totalDiscount", 0]
          }
        }
      }
    ]
  );
  

  const result = await quotationModel.updateMany(
    { items: { $exists: true } },
    [ 
      {
        $set: {
          optionalItems: {
            $cond: {
              if: { $isArray: "$optionalItems" },
              then: {
                $concatArrays: [
                  [
                    {
                      items: "$items",
                      totalDiscount: "$totalDiscount"
                    }
                  ],
                  { $slice: ["$optionalItems", 1, { $size: "$optionalItems" }] }
                ]
              },
              else: [
                {
                  items: "$items",
                  totalDiscount: "$totalDiscount"
                }
              ]
            }
          }
        }
      },
      {
        $unset: ["items", "totalDiscount"]
      }
    ]
  );  

  console.log(`Documents matched: ${result.matchedCount}`);
  console.log(`Documents modified: ${result.modifiedCount}`);
  console.log('Update process completed.');
}

export async function down (): Promise<void> {
  // Write migration here
}
