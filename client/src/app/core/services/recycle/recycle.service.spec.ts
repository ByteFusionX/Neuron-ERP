import { TestBed } from '@angular/core/testing';

import { RecycleService } from './recycle.service';

describe('RecycleService', () => {
  let service: RecycleService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RecycleService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
