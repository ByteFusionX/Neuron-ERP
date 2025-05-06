export interface announcementPostData {
    title:String | null | undefined;
    description:String | null | undefined;
    date:Date | null | undefined;
    userId :String | null | undefined;
    isEdit: boolean;
    _id: string | undefined;
    category: string[] 
}

export interface announcementGetData {
    _id: string
    title: string
    description: string
    date: Date
    createdDate: Date,
    celeb: boolean
    viewedBy:string[]
    category: string[]
    createdBy: string
  }
  
  