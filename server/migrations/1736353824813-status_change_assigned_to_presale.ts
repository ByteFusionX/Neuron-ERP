import enquiryModel from "../src/models/enquiry.model";
import { connectToDatabase } from '../src/db/connect';


export async function up (): Promise<void> {
  await connectToDatabase();

  await enquiryModel.updateMany(
    {
      status:'Assigned to Presale'
    },
    [
      {
        $set: {
          status : 'Assigned To Presale Manager'
        }
      }
    ]
  )

  await enquiryModel.updateMany(
    {
      status:'Rejected by Presale',
      enqId: { $ne: 'ENQ-NT/SA/PROC-12/24-061' }
    },
    [
      {
        $set: {
          status : 'Rejected by Presale Engineer'
        }
      }
    ]
  )

  await enquiryModel.updateMany(
    {
      status:'Rejected by Presale',
      enqId: 'ENQ-NT/SA/PROC-12/24-061'
    },
    [
      {
        $set: {
          status : 'Rejected by Presale Manager'
        }
      }
    ]
  )

}

export async function down (): Promise<void> {
  // Write migration here
}
