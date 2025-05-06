export interface NotePost {
    note: string
}

export interface NotePatch {
    noteType: string;
    note:string;
}

export interface NoteDelete {
    noteType: string;
}

export interface Note {
    _id: string;
    note: string;
}

export interface Notes {
    customerNotes: Note[];
    termsAndConditions: Note[];
}