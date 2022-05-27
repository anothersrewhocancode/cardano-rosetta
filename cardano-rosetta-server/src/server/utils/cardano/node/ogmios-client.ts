/* eslint-disable no-console */
/* eslint-disable no-magic-numbers */
/* eslint-disable no-useless-return */
import pRetry from 'p-retry';
import {
  ConnectionConfig,
  createConnectionObject,
  createInteractionContext,
  createStateQueryClient,
  createTxSubmissionClient,
  getServerHealth,
  ServerHealth,
  // Schema,
  StateQuery,
  TxSubmission
} from '@cardano-ogmios/client';
import { Logger } from 'fastify';

const MODULE_NAME = 'OgmiosClient';

export interface OgmiosClient {
  submitTransaction(logger: Logger, transaction: string): Promise<void>;
  shutdown(): Promise<void>;
}

export const configure = async (ogmiosConnectionConfig?: ConnectionConfig): Promise<OgmiosClient> => {
  const serverHealthFetcher = await getServerHealth({ connection: createConnectionObject(ogmiosConnectionConfig) });
  let txSubmissionClient: TxSubmission.TxSubmissionClient | undefined;
  await pRetry(
    async () => {
      txSubmissionClient = await createTxSubmissionClient(
        await createInteractionContext(
          error => {
            console.error({ module: MODULE_NAME, error: error.name }, error.message);
          },
          console.info,
          {
            connection: ogmiosConnectionConfig,
            interactionType: 'LongRunning'
          }
        )
      );
    },
    {
      factor: 1.2,
      retries: 100,
      onFailedAttempt: () => console.log('Establishing connection to cardano-node')
    }
  );
  return {
    submitTransaction: async (logger: Logger, transaction: string) => {
      if (serverHealthFetcher.networkSynchronization < 0.95) {
        throw new Error('Operation requires synced node');
      }
      logger.info('[submitTransaction] About to submit transaction', transaction);
      await txSubmissionClient?.submitTx(transaction);
      logger.info('[submitTransaction] transaction successfully sent', transaction);
    },
    shutdown: async () => {
      await txSubmissionClient?.shutdown();
    }
  };
};
