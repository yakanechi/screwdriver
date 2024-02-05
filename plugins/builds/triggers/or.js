'use strict';

const {
    parseJobInfo, createInternalBuild,
} = require('./functions');
const logger = require('screwdriver-logger');

// =============================================================================
//
//      Function
//
// =============================================================================
class OrTrigger {

    #eventFactory;
    #buildFactory;
    #jobFactory;
    #pipelineFactory;

    #currentPipeline;
    #currentEvent;
    #currentJob;
    #currentBuild;
    #username;
    #scmContext;


    constructor(app, config, currentEvent) {
        this.#eventFactory = app.eventFactory;
        this.#buildFactory = app.buildFactory;
        this.#jobFactory = app.jobFactory;
        this.#pipelineFactory = app.pipelineFactory;

        this.#currentPipeline = config.pipeline;
        this.#currentEvent = currentEvent;
        this.#currentJob = config.job;
        this.#currentBuild = config.build;
        this.#username = config.username;
        this.#scmContext = config.scmContext;
    }

    async run(nextJobName, joinObj, parentBuilds) {
        const internalBuildConfig = {
            jobFactory: this.#jobFactory,
            buildFactory: this.#buildFactory,
            pipelineId: this.#currentPipeline.id,
            jobName: nextJobName,
            username: this.#username,
            scmContext: this.#scmContext,
            event: this.#currentEvent, // this is the parentBuild for the next build
            baseBranch: this.#currentEvent.baseBranch || null,
            parentBuilds: parentBuilds,
            parentBuildId: this.#currentBuild.id,
        };

        const nextJob = await this.#jobFactory.get({
            name: nextJobName,
            pipelineId: this.#currentPipeline.id,
        });

        const existNextBuild = await this.#buildFactory.get({
            eventId: this.#currentEvent.id,
            jobId: nextJob.id,
        });

        if (existNextBuild === null) {
            return createInternalBuild(internalBuildConfig);
        }

        if (!['CREATED', null, undefined].includes(existNextBuild.status)) {
            return existNextBuild;
        }

        existNextBuild.status = 'QUEUED';
        await existNextBuild.update();

        return existNextBuild.start();
    }
}

// =============================================================================
//
//      module.exports
//
// =============================================================================
module.exports = {
    OrTrigger: OrTrigger,
};
