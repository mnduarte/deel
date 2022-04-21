
const getProfile = async (req, res, next) => {
    const { Profile } = req.app.get('models')

    const idProfile = req.params.id || 0;
    const profile = await Profile.findOne({ where: { id: idProfile } })

    if (!profile) return res.status(401).end()
    req.profile = profile
    next()
}
module.exports = { getProfile }