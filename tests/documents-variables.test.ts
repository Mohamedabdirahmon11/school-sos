import assert from 'node:assert/strict';
import { test } from 'node:test';
import { replaceDocumentVariables, requiresDocumentGenerationConfirmation } from '../src/lib/documents/variables.ts';

test('document variables are inserted as escaped plain text', () => {
  const result = replaceDocumentVariables('<p>{student_name}</p>', { student_name:'Asha <script>alert(1)</script> & Ali' });
  assert.equal(result.html,'<p>Asha &lt;script&gt;alert(1)&lt;/script&gt; &amp; Ali</p>');
  assert.deepEqual(result.missing,[]);
});

test('missing and unknown variables are reported and never left as braces', () => {
  const result = replaceDocumentVariables('<p>{student_name} {parent_name} {unknown_key}</p>', { student_name:'Asha' });
  assert.equal(result.html,'<p>Asha  </p>');
  assert.deepEqual(result.missing,['parent_name','unknown_key']);
});


test('document generation requires explicit confirmation when any student has missing values', () => {
  assert.equal(requiresDocumentGenerationConfirmation([{studentName:'Asha',missing:['parent_name']}], false), true);
  assert.equal(requiresDocumentGenerationConfirmation([{studentName:'Asha',missing:[]}], false), false);
  assert.equal(requiresDocumentGenerationConfirmation([{studentName:'Asha',missing:['parent_name']}], true), false);
  assert.equal(requiresDocumentGenerationConfirmation([], false), false);
});
