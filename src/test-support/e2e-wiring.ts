import type { AppServiceOverrides } from '../app/app-services';
import type { MatchRouteViewProps } from '../app/AppRoot';
import { createLocalProgressRepositoryFactory } from '../progression';
import { E2EDriverController, type TePpuE2EDriver } from './e2e-driver';
import { createE2EMatchRenderer } from './e2e-match';
import { createE2EPlatform } from './e2e-platform';

export interface E2EWiring {
  readonly driver: TePpuE2EDriver;
  readonly renderMatch: (props: MatchRouteViewProps) => React.ReactNode;
  readonly serviceOverrides: AppServiceOverrides;
}

export function createE2EWiring(): E2EWiring {
  const controller = new E2EDriverController();
  const localProgress = createLocalProgressRepositoryFactory(window.localStorage);
  controller.install();
  return {
    driver: controller.driver,
    renderMatch: createE2EMatchRenderer(controller),
    serviceOverrides: {
      platform: createE2EPlatform(controller),
      progressRepositoryFactory: {
        forIdentity(identity) {
          const repository = localProgress.forIdentity(identity);
          return {
            load: () => repository.load(),
            save: (state) => controller.shouldFailProgressSave()
              ? Promise.resolve({
                ok: false,
                error: {
                  code: 'WRITE_FAILED',
                  message: 'Progress could not be saved.',
                },
              })
              : repository.save(state),
          };
        },
      },
    },
  };
}
