import mongooose, { Schema } from "mongoose";

const subscriptionSchema =  new Schema({
    subscriber: {
        type: Schema.Types.ObjectId, //users subscribing
        ref: "User",
    },
    channel :{
        type: Schema.Types.ObjectId, //channel subscribed to
        ref : "User"
    }
},{timestamps: true})

export const Subscription = mongooose.model("Subscription", subscriptionSchema)