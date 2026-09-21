import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FormSaveFlow } from './form-save-flow';

@Component({ standalone: true, template: '' })
class HostComponent {
  form = new FormGroup({ name: new FormControl('a', Validators.required) });
  flow = new FormSaveFlow(this.form);
}

describe('FormSaveFlow', () => {
  function setup() {
    const host = TestBed.createComponent(HostComponent).componentInstance;
    return host;
  }

  it('keeps input, re-enables the form and applies server field errors on a 422', async () => {
    const { form, flow } = setup();
    form.controls.name.setValue('taken');
    const result = await flow.run(() => Promise.reject(new HttpErrorResponse({
      status: 422, error: { message: 'Fix', fieldErrors: { name: ['In use'] } } })));
    expect(result.status).toBe('failed');
    expect(form.enabled).toBeTrue();
    expect(form.controls.name.value).toBe('taken');
    expect(form.controls.name.errors?.['server']).toBe('In use');
    expect(flow.saving).toBeFalse();
  });

  it('does not call save when invalid, and ignores a second run while saving', async () => {
    const { form, flow } = setup();
    form.controls.name.setValue('');
    let calls = 0;
    expect((await flow.run(async () => { calls++; })).status).toBe('invalid');
    form.controls.name.setValue('ok');
    const first = flow.run(async () => { calls++; });
    expect((await flow.run(async () => { calls++; })).status).toBe('busy');
    await first;
    expect(calls).toBe(1);
  });
});
