import { JobListComponent } from './job-list.component';
import { allocateStatus } from 'src/app/shared/interfaces/job.interface';

/** Row-action rules are pure functions of the privileges and the row, so they run without the grid or services. */
const ctx = (flags: Partial<Record<'canAllocateJobs' | 'canTransferProcurementPerson', boolean>>) => {
  const c: any = { canAllocateJobs: false, canTransferProcurementPerson: false, ...flags };
  c.hasSupply = (r: any) => (JobListComponent.prototype as any).hasSupply.call(c, r);
  return c;
};
const proto = JobListComponent.prototype as any;

describe('JobListComponent row rules', () => {
  it('allocates only pending jobs', () => {
    const c = ctx({ canAllocateJobs: true });
    expect(proto.canAllocate.call(c, { allocateStatus: allocateStatus.Pending })).toBeTrue();
    expect(proto.canAllocate.call(c, { allocateStatus: allocateStatus.OpenToWork })).toBeFalse();
  });

  it('lets a supply job without a procurement person be assigned one', () => {
    const c = ctx({ canTransferProcurementPerson: true });
    const row = { allocateType: 'Supply Only', allocateStatus: allocateStatus.OpenToWork };
    expect(proto.canTransfer.call(c, row)).toBeTrue();
    expect(proto.transferLabel.call(c, row)).toBe('Assign Procurement');
  });

  it('does not offer transfer on a non-supply job with nobody assigned, or once completed', () => {
    const c = ctx({ canTransferProcurementPerson: true });
    expect(proto.canTransfer.call(c, { allocateType: 'AMC', allocateStatus: allocateStatus.OpenToWork })).toBeFalse();
    expect(proto.canTransfer.call(c, { allocateType: 'Supply Only', allocateStatus: allocateStatus.Completed })).toBeFalse();
  });
});
