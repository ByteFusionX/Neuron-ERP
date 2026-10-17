import { getEmployee } from "./employee.interface";

export interface login{
    token?:string,
    employeeData?:getEmployee,
    employeeNotFoundError?:boolean,
    reason?:'noEmail'|'ambiguousEmail'|'blocked'|'notFound'|'linkedElsewhere',
    passwordNotMatchError?:boolean
}