import { Context, Service } from '@deepseek-ai/cordis'

import { nestedFollowupsDomainSpec } from './domain.ts'
import { TreeMetadataRepository } from './storage.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    nestedFollowupsMetadata: NestedFollowupsMetadataService
  }
}

/** Lifecycle owner for the plugin's durable relationship metadata. */
export class NestedFollowupsMetadataService extends Service {
  static inject = ['storageDomain']

  private currentRepository: TreeMetadataRepository | undefined

  constructor(ctx: Context) {
    super(ctx, 'nestedFollowupsMetadata')
  }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(nestedFollowupsDomainSpec)
    this.currentRepository = new TreeMetadataRepository(
      domain.table('trees'),
      domain.table('branches'),
    )
    this.ctx.effect(() => async () => {
      this.currentRepository = undefined
      await domain.close()
    }, 'nested-followups.domain-close')
  }

  get repository(): TreeMetadataRepository {
    if (this.currentRepository === undefined) {
      throw new Error('nested follow-up metadata is not initialized')
    }
    return this.currentRepository
  }
}
