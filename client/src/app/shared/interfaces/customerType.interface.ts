export interface getCustomerType {
    _id?:string;
    customerTypeName: string;
    createdDate: number;
    isActive?: boolean;
    defaultDiscount?: number;
}