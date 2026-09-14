import { useState } from "react";
import type {
  PersistedProductGroup,
  ProductGroupAuthenticityRuleInput,
  ProductGroupCorrectionReason,
  ShopifyProductTaxonomyCategory,
} from "../../api/products";
import {
  confirmPersistedProductGroup,
  createPersistedProductGroupAuthenticityRule,
  createPersistedProductGroupRule,
  deletePersistedProductGroupAuthenticityRule,
  deletePersistedProductGroupRule,
  excludePersistedProductGroupMember,
  updatePersistedProductGroupAuthenticityRule,
  updatePersistedProductGroupEmbeddingSettings,
  updatePersistedProductGroupRule,
} from "../../api/products";
import { errorMessage } from "./clusterDomain";
import { ProductGroupCard } from "./ProductGroupCard";

export function ProductGroupSettings({
  group,
  ipId,
  onGroupChange,
  onRefresh,
}: {
  group: PersistedProductGroup;
  ipId: string;
  onGroupChange: (
    update: (current: PersistedProductGroup) => PersistedProductGroup,
  ) => void;
  onRefresh: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [savingCorrectionProfileId, setSavingCorrectionProfileId] =
    useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirmGroup(
    groupId: string,
    displayName: string,
    shopifyCategory?: ShopifyProductTaxonomyCategory,
  ) {
    setSaving(true);
    setError(null);
    try {
      const result = await confirmPersistedProductGroup(
        ipId,
        groupId,
        displayName,
        shopifyCategory?.id,
      );
      onGroupChange((current) => ({ ...current, ...result.group }));
    } catch (caught: unknown) {
      setError(errorMessage(caught, "Unable to save the product details."));
      throw caught;
    } finally {
      setSaving(false);
    }
  }

  async function updateEmbeddingThreshold(
    groupId: string,
    embeddingMatchThreshold: number | null,
  ) {
    setError(null);
    try {
      const result = await updatePersistedProductGroupEmbeddingSettings(
        ipId,
        groupId,
        embeddingMatchThreshold,
      );
      onGroupChange((current) => ({ ...current, ...result.group }));
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught, "Unable to save the matching setting."));
      throw caught;
    }
  }

  async function correctGroupMember(
    groupId: string,
    profileId: string,
    reason: ProductGroupCorrectionReason,
  ) {
    setSavingCorrectionProfileId(profileId);
    setError(null);
    try {
      await excludePersistedProductGroupMember(ipId, groupId, {
        profile_id: profileId,
        reason,
      });
      onRefresh();
    } catch (caught: unknown) {
      setError(errorMessage(caught, "Unable to remove the listing from this product."));
      throw caught;
    } finally {
      setSavingCorrectionProfileId(null);
    }
  }

  async function createGroupRule(groupId: string, instruction: string) {
    setError(null);
    try {
      const result = await createPersistedProductGroupRule(ipId, groupId, instruction);
      onGroupChange((current) => ({
        ...current,
        rules: [...current.rules, result.rule],
      }));
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught, "Unable to add the product rule."));
      throw caught;
    }
  }

  async function updateGroupRule(
    groupId: string,
    ruleId: string,
    instruction: string,
  ) {
    setError(null);
    try {
      const result = await updatePersistedProductGroupRule(
        ipId,
        groupId,
        ruleId,
        instruction,
      );
      onGroupChange((current) => ({
        ...current,
        rules: current.rules.map((rule) =>
          rule.id === result.rule.id ? result.rule : rule
        ),
      }));
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught, "Unable to update the product rule."));
      throw caught;
    }
  }

  async function deleteGroupRule(groupId: string, ruleId: string) {
    setError(null);
    try {
      const result = await deletePersistedProductGroupRule(ipId, groupId, ruleId);
      onGroupChange((current) => ({
        ...current,
        rules: current.rules.filter((rule) => rule.id !== ruleId),
      }));
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught, "Unable to remove the product rule."));
      throw caught;
    }
  }

  async function createAuthenticityRule(
    groupId: string,
    input: ProductGroupAuthenticityRuleInput,
  ) {
    setError(null);
    try {
      const result = await createPersistedProductGroupAuthenticityRule(
        ipId,
        groupId,
        input,
      );
      onGroupChange((current) => ({
        ...current,
        authenticity_rules: [...current.authenticity_rules, result.rule],
      }));
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught, "Unable to add the authenticity check."));
      throw caught;
    }
  }

  async function updateAuthenticityRule(
    groupId: string,
    ruleId: string,
    input: ProductGroupAuthenticityRuleInput,
  ) {
    setError(null);
    try {
      const result = await updatePersistedProductGroupAuthenticityRule(
        ipId,
        groupId,
        ruleId,
        input,
      );
      onGroupChange((current) => ({
        ...current,
        authenticity_rules: current.authenticity_rules.map((rule) =>
          rule.id === result.rule.id ? result.rule : rule
        ),
      }));
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught, "Unable to update the authenticity check."));
      throw caught;
    }
  }

  async function deleteAuthenticityRule(groupId: string, ruleId: string) {
    setError(null);
    try {
      const result = await deletePersistedProductGroupAuthenticityRule(
        ipId,
        groupId,
        ruleId,
      );
      onGroupChange((current) => ({
        ...current,
        authenticity_rules: current.authenticity_rules.filter(
          (rule) => rule.id !== ruleId,
        ),
      }));
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught, "Unable to remove the authenticity check."));
      throw caught;
    }
  }

  return (
    <div>
      {error && (
        <div
          role="alert"
          className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 font-semibold text-red-600 hover:text-red-900"
          >
            Dismiss
          </button>
        </div>
      )}
      <ProductGroupCard
        workspace
        settingsOnly
        group={group}
        availableGroups={[group]}
        reconciliationSuggestions={[]}
        index={0}
        ipId={ipId}
        mode="same"
        showPersistedMembers
        triageProjectionAvailable
        saving={saving}
        mergeSourceGroup={null}
        savingMergeKey={null}
        revokingMergeDecisionId={null}
        savingCorrectionProfileId={savingCorrectionProfileId}
        activeTaskProfileId={null}
        loadingTaskProfileId={null}
        allFindings={null}
        catalogSupported
        expandedSubgroupKeys={new Set()}
        loadingAllFindings={false}
        activeBatch={null}
        batchProgress={null}
        batchDisabled={false}
        onSelectBatch={() => undefined}
        onBatchAction={() => undefined}
        onClearBatch={() => undefined}
        onToggleBatchFinding={() => undefined}
        onSetAllBatchFindings={() => undefined}
        onToggleSubgroupListings={() => undefined}
        onOpenTask={() => undefined}
        onOpenFinding={() => undefined}
        onConfirmGroup={confirmGroup}
        onSelectMergeSource={() => undefined}
        onLoadGroupForReview={async () => null}
        onMergeGroups={async () => undefined}
        onRevokeMerge={async () => undefined}
        onUpdateEmbeddingThreshold={updateEmbeddingThreshold}
        onCorrectGroupMember={correctGroupMember}
        onCreateRule={createGroupRule}
        onUpdateRule={updateGroupRule}
        onDeleteRule={deleteGroupRule}
        onCreateAuthenticityRule={createAuthenticityRule}
        onUpdateAuthenticityRule={updateAuthenticityRule}
        onDeleteAuthenticityRule={deleteAuthenticityRule}
      />
    </div>
  );
}
