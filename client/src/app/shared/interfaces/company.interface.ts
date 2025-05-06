export interface getCompanyDetails {
    name:string,
    description:string,
    address:Address
  }

  interface Address{
    street:string,
    area:string,
    city:string,
    country:string
  }