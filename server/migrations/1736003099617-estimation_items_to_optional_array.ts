import enquiryModel from "../src/models/enquiry.model";
import { connectToDatabase } from '../src/db/connect';


export async function up(): Promise<void> {
  await connectToDatabase();

  const result = await enquiryModel.updateMany(
    { "preSale.estimations.items": { $exists: true } },
    [
      {
        $set: {
          "preSale.estimations.optionalItems": {
            $cond: {
              if: { $isArray: "$preSale.estimations.optionalItems" },
              then: {
                $concatArrays: [
                  [
                    {
                      items: "$preSale.estimations.items",
                      totalDiscount: "$preSale.estimations.totalDiscount"
                    }
                  ],
                  { $slice: ["$preSale.estimations.optionalItems", 1, { $size: "$preSale.estimations.optionalItems" }] }
                ]
              },
              else: [
                {
                  items: "$preSale.estimations.items",
                  totalDiscount: "$preSale.estimations.totalDiscount"
                }
              ]
            }
          }
        }
      },
      {
        $unset: ["preSale.estimations.items", "preSale.estimations.totalDiscount"]
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
