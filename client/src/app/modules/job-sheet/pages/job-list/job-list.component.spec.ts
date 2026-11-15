import { JobListComponent } from './job-list.component';
import { allocateStatus, JobStatus } from 'src/app/shared/interfaces/job.interface';

/** Row-action rules are pure functions of the privileges and the row, so they run without the grid or services. */
const ctx = (flags: Partial<Record<'canAllocateJobs' | 'canTransferProcurementPerson', boolean>>) => {
  const c: any = { canAllocateJobs: false, canTransferProcurementPerson: false, ...flags };
  return c;
};
const proto = JobListComponent.prototype as any;

describe('JobListComponent row rules', () => {
  it('allocates only new pending jobs with no allocate history', () => {
    const c = ctx({ canAllocateJobs: true });
    expect(proto.canAllocate.call(c, { allocateStatus: allocateStatus.Pending })).toBeTrue();
    expect(proto.canAllocate.call(c, { allocateStatus: allocateStatus.OpenToWork })).toBeFalse();
    // back in Pending after a hold, but it was allocated before
    expect(proto.canAllocate.call(c, { allocateType: 'AMC', allocateStatus: allocateStatus.Pending })).toBeFalse();
  });

  it('never allocates or reallocates a completed job', () => {
    const c = ctx({ canAllocateJobs: true, canTransferProcurementPerson: true });
    expect(proto.canAllocate.call(c, { status: JobStatus.completed, allocateStatus: allocateStatus.Pending })).toBeFalse();
    expect(proto.canTransfer.call(c, { status: JobStatus.completed, allocateType: 'AMC', allocateStatus: allocateStatus.WorkInProgress })).toBeFalse();
  });

  it('lets a supply job without a procurement person be assigned one', () => {
    const c = ctx({ canTransferProcurementPerson: true });
    const row = { allocateType: 'Supply Only', allocateStatus: allocateStatus.OpenToWork };
    expect(proto.canTransfer.call(c, row)).toBeTrue();
    expect(proto.transferLabel.call(c, row)).toBe('Assign Procurement');
  });

  it('offers reallocate on allocated pending, open to work and in progress jobs only', () => {
    const c = ctx({ canTransferProcurementPerson: true });
    expect(proto.canTransfer.call(c, { allocateType: 'AMC', allocateStatus: allocateStatus.Pending })).toBeTrue();
    expect(proto.canTransfer.call(c, { allocateType: 'AMC', allocateStatus: allocateStatus.OpenToWork })).toBeTrue();
    expect(proto.canTransfer.call(c, { allocateType: 'AMC', allocateStatus: allocateStatus.WorkInProgress })).toBeTrue();
    expect(proto.canTransfer.call(c, { allocateType: 'AMC', allocateStatus: allocateStatus.Completed })).toBeFalse();
  });

  it('hides reallocate on a new job with no allocate history', () => {
    expect(proto.canTransfer.call(ctx({ canTransferProcurementPerson: true }), { allocateStatus: allocateStatus.Pending })).toBeFalse();
  });

  it('hides reallocate without the privilege', () => {
    expect(proto.canTransfer.call(ctx({}), { allocateType: 'AMC', allocateStatus: allocateStatus.Pending })).toBeFalse();
  });
});
