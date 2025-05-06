import mongoose from 'mongoose';
import { connectToDatabase } from '../src/db/connect';

export async function up(): Promise<void> {
  await connectToDatabase();
  
  // Check if the connection is established
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('Failed to connect to MongoDB');
  }
  
  // Get direct collection references - now TypeScript knows db is defined
  const db = mongoose.connection.db;
  const customerCollection = db.collection('customers');
  const customerTypeCollection = db.collection('customertypes');
  
  // Step 1: Find all customers with string customerType values
  const customers = await customerCollection.find({
    customerType: { $type: 'string' }
  }).toArray();
  
  console.log(`Found ${customers.length} customers with string customerType values`);
  
  // Get unique customer types
  const uniqueCustomerTypes = [...new Set(
    customers.map(customer => customer.customerType)
      .filter(type => type !== null && type !== undefined)
  )];
  
  console.log(`Found ${uniqueCustomerTypes.length} unique customer types: ${uniqueCustomerTypes.join(', ')}`);
  
  // Step 2: Create new customer type documents
  const typeMapping = new Map<string, string>();
  
  for (const typeName of uniqueCustomerTypes) {
    // Check if this type already exists
    let customerType = await customerTypeCollection.findOne({ customerTypeName: typeName });
    
    if (!customerType) {
      // Create new customer type
      const result = await customerTypeCollection.insertOne({
        customerTypeName: typeName,
        createdDate: new Date(),
        isDeleted: false
      });
      customerType = { _id: result.insertedId };
    }
    
    // Store the mapping
    typeMapping.set(typeName, customerType._id.toString());
    console.log(`Customer type "${typeName}" mapped to ID: ${customerType._id}`);
  }
  
  // Step 3: Update all customers to reference the new customer type documents
  let updatedCount = 0;
  
  for (const customer of customers) {
    if (customer.customerType && typeMapping.has(customer.customerType)) {
      const typeId = typeMapping.get(customer.customerType);
      
      await customerCollection.updateOne(
        { _id: customer._id },
        { $set: { customerType: new mongoose.Types.ObjectId(typeId) } }
      );
      updatedCount++;
    }
  }
  
  console.log(`Updated ${updatedCount} customer documents with new customer type references`);
  console.log('Migration completed successfully!');
}

export async function down(): Promise<void> {
  console.log('Warning: This migration is not reversible without additional data. Original string values are lost.');
}