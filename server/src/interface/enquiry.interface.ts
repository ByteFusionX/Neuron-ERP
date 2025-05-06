export interface Enquiry {
    enquiryId: string;
    client: string;
    contact: string;
    department: string;
    salesPerson: string;
    title: string;
    date: string | Date;
    attachments: string[];
    preSale: {
        presalePerson: string;
        presaleFiles: string[];
        comment:string;
        newFeedbackAccess:boolean;
    };
    status: string;
}

export interface File {
    fieldname: string,
    originalname: string,
    encoding: string,
    mimetype: string,
    destination: string,
    filename: string,
    path: string,
    size: number,
}