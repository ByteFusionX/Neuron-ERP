export interface getCompanyDetails {
    name:string,
    description:string,
    address:Address,
    taxRegistrationNumber?:string,
    registrationNumber?:string,
    logo?:string
  }

  interface Address{
    street:string,
    area:string,
    city:string,
    country:string
  }
