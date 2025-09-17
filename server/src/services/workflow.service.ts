import Workflow from "../models/workflow.model";
import Employee from "../models/employee.model";
export const getWorkflowSteps = async (workflowFeature: string, employeeId: string) => {
    try {
        const workflow = await Workflow.findOne({ feature: workflowFeature }).populate('steps.role');

        if (!workflow || !workflow.steps.length) {
            throw new Error(`No workflow configured for ${workflowFeature} claims`);
        }

        const employeeData = await Employee.findOne({ _id: employeeId }).populate('reportingTo');
        const isReportingToExist = employeeData.reportingTo && employeeData.reportingTo !== null;
        
        let approvalStatus = [];
        if(workflow.needsManagerApproval && isReportingToExist) {
            const step = {
                status: 'pending',
                managerApproval: true,
                step: 0,
            }
            approvalStatus.push(step);
        }

        approvalStatus.push(...workflow.steps
            .sort((a, b) => a.order - b.order)
            .map(step => ({
                status: 'pending',
                role: step.role,
                step: step.order,
                managerApproval: false,
            })));

        return approvalStatus;
    } catch (error) {
        throw new Error(error);
    }
}

export const updateApprovalStatus = async (status: string, approvalStatus: any, comment: string, employee: any) => {
    try {
        const pendingStatuses = approvalStatus
            .filter(approval => approval.status === 'pending')
            .sort((a, b) => a.step - b.step);

        if (pendingStatuses.length === 0) {
            throw new Error('No pending approvals found');
        }

        const nextApproval = pendingStatuses[0];

        if (nextApproval.role && nextApproval.role._id.toString() !== employee.category._id.toString()) {
            throw new Error('You are not authorized to approve this step');
        }

        const approvalIndex = approvalStatus.findIndex(
            approval => approval._id === nextApproval._id
        );

        approvalStatus[approvalIndex].status = status;
        approvalStatus[approvalIndex].updatedBy = employee._id;
        approvalStatus[approvalIndex].updatedDate = new Date();
        approvalStatus[approvalIndex].comment = comment;
        if (status === 'rejected') {
            approvalStatus = approvalStatus.filter(approval => approval.status !== 'pending');
        }

        return approvalStatus;
    } catch (error) {
        throw new Error(error);
    }
}