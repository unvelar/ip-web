import {expect,test} from 'bun:test';
import {monitoringRecommendation} from '../src/lib/monitoringRecommendation';

function finding(status:'pending'|'complete'|'inconclusive'|'failed',label='Investigation') {
 return {licensed_seller:false,manual_candidate_outcome:null,suggested_review_outcome:'none',suggested_review_reason:null,
  actionability:{key:'investigate',label,reason:'The recorded assessment reason.',assessment_status:status,
   reason_category:'insufficient_evidence',decision_factors:[],classification_version:'monitoring-recommendation-v14'}} as Parameters<typeof monitoringRecommendation>[0];
}
test('completed and failed assessments are never presented as pending work',()=>{
 for(const [status,label] of [['pending','Assessment pending'],['complete','No supported action'],
  ['inconclusive','Evidence inconclusive'],['failed','Assessment unavailable']] as const)
  expect(monitoringRecommendation(finding(status))).toMatchObject({label:null,assessmentLabel:label});
});
test('legacy completed assessments retain truthful labels before an API rollout',()=>{
 const legacy=finding('complete','No infringement evidence');delete legacy.actionability.assessment_status;
 expect(monitoringRecommendation(legacy).assessmentLabel).toBe('No supported action');
});
test('an explicit manual decision still takes precedence over assessment progress',()=>{
 expect(monitoringRecommendation({...finding('failed'),manual_candidate_outcome:'do_not_pursue'}).label).toBe('Do not pursue');
});
