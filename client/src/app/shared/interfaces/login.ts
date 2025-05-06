import { getEmployee } from "./employee.interface";

export interface login{
    token?:string,
    employeeData?:getEmployee,
    employeeNotFoundError?:boolean,
    passwordNotMatchError?:boolean
}