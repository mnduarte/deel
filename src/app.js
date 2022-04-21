const express = require('express');
const bodyParser = require('body-parser');
const { sequelize, Op } = require('./model')
const { getProfile } = require('./middleware/getProfile')
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

/**
 * FIX ME!
 * @returns contract by id
 */


app.get('/contracts/:id', getProfile, async (req, res) => {
    const { Contract } = req.app.get('models')
    const { id } = req.params
    const contract = await Contract.findOne({ where: { id } })
    if (!contract) return res.status(404).end()
    res.json(contract)
})

app.get('/contracts', async (req, res) => {
    const { Contract } = req.app.get('models')
    const contracts = await Contract.findAll({ where: { status: { [Op.ne]: 'terminated' } } })
    if (!contracts) return res.status(404).end()
    res.json(contracts)
})

app.get('/jobs/unpaid', async (req, res) => {
    const { Contract, Job } = req.app.get('models')
    const jobs = await Job.findAll({
        where: { paid: null },
        include: { model: Contract, where: { status: { [Op.ne]: 'terminated' } } },
    });

    if (!jobs) return res.status(404).end()
    res.json({ jobs })
})



app.post('/jobs/:job_id/pay', async (req, res) => {
    const idJob = req.params.job_id;
    const { Contract, Job, Profile } = req.app.get('models');

    const job = await Job.findOne({
        where: { id: idJob },
        include: [{ model: Contract }],
    });

    if (job.paid) {
        return res.status(500).send('already paid!');
    }

    const { Contract: { ClientId }, price } = job
    const profile = await Profile.findOne({ where: { id: ClientId } })

    if (profile.balance < price) {
        return res.status(500).send('not enough money available!');
    }

    profile.balance = profile.balance - price
    job.paid = true
    job.paymentDate = new Date()

    await profile.save()
    await job.save()

    res.json({ profile, job })
})


app.post('/balances/deposit/:userId', async (req, res) => {
    const { userId } = req.params;
    const { amount } = req.query;
    const { Contract, Job, Profile } = req.app.get('models');


    const user = await Profile.findOne({
        where: { id: userId },
        include: [{
            model: Contract, as: 'Client', attributes: ['ContractorId']
        }],
    });

    const idContractors = user.Client.map(({ ContractorId }) => ContractorId)

    const jobs = await Job.findAll({
        where: { ContractId: idContractors, paid: null },
    });

    const priceTotalJobs = jobs.reduce((acc, current) => acc += current.price, 0)

    if (amount > priceTotalJobs * 0.25) {
        return res.status(500).send('The amount may not exceed 25% of the total amount payable!');
    }

    user.balance = user.balance + parseInt(amount)
    await user.save()

    return res.json({ user })
})

app.get('/admin/best-profession', async (req, res) => {
    const { start: startDate, end: endDate } = req.query;
    const { Contract, Job, Profile } = req.app.get('models');


    const jobs = await Job.findAll({
        where: {
            paymentDate: {
                [Op.between]: [new Date(Date.parse(startDate)), new Date(Date.parse(endDate))]
            }
        },
        include: { model: Contract },
    });

    if (!jobs.length) {
        return res.json({})
    }

    const idClients = jobs.map(({ Contract: { ClientId } }) => ClientId)

    const users = await Profile.findAll({
        where: { id: idClients },
    });

    const earnedByProfession = {}

    for (const job of jobs) {
        const user = users.filter(user => user.id === job.Contract.ClientId)[0];
        const totalEarned = earnedByProfession[user.profession] || 0;
        earnedByProfession[user.profession] = totalEarned + job.price
    }

    let maxEarnedProfession = []

    for (const profession of Object.keys(earnedByProfession)) {
        if (earnedByProfession[profession] > (Object.values(maxEarnedProfession)[0] || 0)) {
            maxEarnedProfession.splice(0, 1, { [profession]: earnedByProfession[profession] })
        }
    }

    return res.json({ maxEarnedProfession })
})


app.get('/admin/best-clients', async (req, res) => {
    const { start: startDate, end: endDate } = req.query;
    const limit = req.query.limit || 2
    const { Contract, Job, Profile } = req.app.get('models');


    const jobs = await Job.findAll({
        where: {
            paymentDate: {
                [Op.between]: [new Date(Date.parse(startDate)), new Date(Date.parse(endDate))]
            }
        },
        include: { model: Contract },
    });

    if (!jobs.length) {
        return res.json({})
    }

    const jobByClient = {}

    for (const job of jobs) {
        const totalPayed = jobByClient[job.Contract.ClientId] || 0;
        jobByClient[job.Contract.ClientId] = totalPayed + job.price
    }

    let sortClient = []

    for (const clientId of Object.keys(jobByClient)) {
        sortClient.push([clientId, jobByClient[clientId]]);
    }

    sortClient.sort(function (a, b) {
        return b[1] - a[1];
    });


    const idBestClients = sortClient.slice(0, limit).map(idClient => idClient[0])

    const bestClients = await Profile.findAll({
        where: { id: idBestClients },
    });

    return res.json({ bestClients })
})

module.exports = app;
