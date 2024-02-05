'use strict';

const {Status} = require('./functions');

// =============================================================================
//
//      Function
//
// =============================================================================
class OrTrigger {

    currentPipeline;
    currentJob;
    currentBuild;
    currentEvent;
    username;
    scmContext;

    eventFactory;
    buildFactory;
    jobFactory;
    pipelineFactory;

    constructor(config, app) {
        this.currentPipeline = config.pipeline;
        this.currentJob = config.job;
        this.currentBuild = config.build;
        this.currentEvent = config.event;
        this.username = config.username;
        this.scmContext = config.scmContext;

        this.eventFactory = app.eventFactory;
        this.buildFactory = app.buildFactory;
        this.jobFactory = app.jobFactory;
        this.pipelineFactory = app.pipelineFactory;
    }

    async getJobFromName(pipelineId, jobName) {
        const query = {pipelineId: pipelineId, name: jobName}
        return await this.jobFactory.get(query);
    }

    async getJobFromID(jobId) {
        const query = jobId
        return await this.jobFactory.get(query);
    }

    async getBuildFromJobId(eventId, jobId) {
        const query = {eventId: eventId, jobId: jobId}
        return await this.buildFactory.get(query);
    }

    async getEvent(eventId) {
        const query = {id: eventId}
        return await this.eventFactory.get(query);
    }

    async createInternalBuild(
        createJobName, createJobId, currentEvent, parentBuildMap,
        isStart, parentBuildId
    ) {
        const pr = currentEvent.pr;
        const prRef = pr.ref || '';
        const prSource = pr.prSource || '';
        const prInfo = (() => {
            if (pr.prBranchName) {
                return {url: pr.url || '', prBranchName: pr.prBranchName || ''}
            }
            return ''
        })();

        const pipelineId = this.currentPipeline.id;
        const job = createJobId ? await this.getJobFromID(createJobId) : await this.getJobFromName(pipelineId, createJobName);

        const jobState = (async () => {
            if (prRef) {
                // Whether a job is enabled is determined by the state of the original job.
                // If the original job does not exist, it will be enabled.
                const originalJobName = job.parsePRJobName('job');
                const originalJob = await this.getJobFromName(pipelineId, originalJobName)
                return originalJob ? originalJob.state : Status.ENABLED;
            }
            return job.state
        })();

        if (jobState === Status.ENABLED) {
            const internalBuildConfig = {
                jobId: job.id,
                sha: currentEvent.sha,
                parentBuildId: parentBuildId,
                parentBuilds: parentBuildMap || {},
                eventId: currentEvent.id,
                username: this.username,
                configPipelineSha: currentEvent.configPipelineSha,
                scmContext: this.scmContext,
                prRef: prRef,
                prSource: prSource,
                prInfo: prInfo,
                start: isStart !== false,
                baseBranch: currentEvent.baseBranch,
            };
            return this.buildFactory.create(internalBuildConfig);
        }

        return null;
    }

    async handle(nextJobName) {
        const currentEvent = await this.getEvent(this.currentBuild.eventId)
        const nextJob = await this.getJobFromName(this.currentPipeline.id, nextJobName);
        const nextJobBuild = (() => {
            const existNextJobBuild = this.getBuildFromJobId(currentEvent.id, nextJob.id);
            if (existNextJobBuild) {
                return existNextJobBuild;
            }
            return this.createInternalBuild(
                this.currentPipeline.id, nextJobName,
                currentEvent, parentBuilds,
                false, buildId
            )
        });
        if ([Status.CREATED, null, undefined].includes(nextJobBuild.status)) {
            nextJobBuild.status = Status.QUEUED;
            await nextJobBuild.update();
            return nextJobBuild.start();
        }

        return nextJobBuild;
    }

}


// =============================================================================
//
//      module.exports
//
// =============================================================================
async function handleOrTriggerBuildInSamePipeline(
    config, app
) {
    const orTrigger = new OrTrigger(config, app);
    return orTrigger.handle();
}

module.exports = {
    handleOrTriggerBuildInSamePipeline,
};
