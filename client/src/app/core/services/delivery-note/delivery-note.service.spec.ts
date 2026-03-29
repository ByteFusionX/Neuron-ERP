import { TestBed } from '@angular/core/testing';

import { DeliveryNoteService } from './delivery-note.service';

describe('DeliveryNoteService', () => {
  let service: DeliveryNoteService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DeliveryNoteService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
