import axios from 'axios';
import { ListrTask, ListrRendererFactory } from 'listr2';
import { Context } from '../types.js';
import chalk from 'chalk';
import { updateLogContext } from '../lib/logger.js';

export default (ctx: Context): ListrTask<Context, ListrRendererFactory, ListrRendererFactory>  =>  {
    return {
        title: `Fetching Results`,
        task: async (ctx, task): Promise<void> => {
            updateLogContext({task: 'fetchResults'});

            try {

                const url = new URL(ctx.build.url);
                const params = new URLSearchParams(url.search);

                const projectId = params.get('projectid');
                const buildId = params.get('buildid');


                const API_URL = `https://api.lambdatest.com/smartui/2.0/build/screenshots?projectId=${projectId}&buildId=${buildId}`;

                const response = await axios.get(API_URL);

                console.table(response.data)

                task.output = chalk.gray(`Fetched results for project ID: ${projectId} and build ID: ${buildId}`);
                task.title = 'Results Fetched';
            } catch (error: any) {
                ctx.log.debug(error);
                task.output = chalk.gray(error.message);
                throw new Error('Fetching results failed');
            }
        },
        rendererOptions: { persistentOutput: true }
    }
}
