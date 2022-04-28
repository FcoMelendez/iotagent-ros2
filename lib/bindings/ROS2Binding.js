/*
 * Copyright 2016 Telefonica Investigación y Desarrollo, S.A.U
 *
 * This file is part of iotagent-json
 *
 * iotagent-json is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version.
 *
 * iotagent-json is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public
 * License along with iotagent-json.
 * If not, seehttp://www.gnu.org/licenses/.
 *
 * For those usages not covered by the GNU Affero General Public License
 * please contact with::[contacto@tid.es]
 */

/* eslint-disable no-unused-vars */
const rclnodejs = require('rclnodejs');
const fs = require('fs');
const iotAgentLib = require('iotagent-node-lib');
const finishSouthBoundTransaction = iotAgentLib.finishSouthBoundTransaction;
const intoTrans = iotAgentLib.intoTrans;
const _ = require('underscore');
const commandHandler = require('../commandHandler');
const async = require('async');
const errors = require('../errors');
const iotaUtils = require('../iotaUtils');
const commonBindings = require('../commonBindings');
const constants = require('../constants');
const context = {
    op: 'IOTAJSON.ROS2.Binding'
};
const config = require('../configService');
const transport = 'ROS2';
var ros2Node, publisher_init, subscriptions, ros2Device;
var ros2Subscribers, ros2Publishers, ros2ServiceClients, ros2ActionClients;
var lastMessages;

function handleIncomingMeasure(req, res, next) {
    let values;

    config
        .getLogger()
        .debug(context, 'Processing multiple HTTP measures for device [%s] with apiKey [%s]', req.deviceId, req.apiKey);

    function updateCommandHandler(error) {
        if (error) {
            next(error);
            config.getLogger().error(
                context,
                /*jshint quotmark: double */
                "MEASURES-002: Couldn't send the updated values to the Context Broker due to an error: %j",
                /*jshint quotmark: single */
                error
            );
        } else {
            config
                .getLogger()
                .info(
                    context,
                    'Multiple measures for device [%s] with apiKey [%s] successfully updated',
                    req.deviceId,
                    req.apiKey
                );

            finishSouthBoundTransaction(next);
        }
    }

    function processHTTPWithDevice(device) {
        let payloadDataArr;
        let attributeArr;
        let attributeValues;
        attributeArr = [];
        payloadDataArr = [];
        if (!Array.isArray(req.jsonPayload)) {
            payloadDataArr.push(req.jsonPayload);
        } else {
            payloadDataArr = req.jsonPayload;
        }
        if (req.jsonPayload) {
            for (const i in payloadDataArr) {
                values = commonBindings.extractAttributes(device, payloadDataArr[i]);
                attributeArr.push(values);
            }
        } else {
            attributeArr = [];
        }
        if (attributeArr.length === 0) {
            finishSouthBoundTransaction(next);
        } else {
            for (const j in attributeArr) {
                attributeValues = attributeArr[j];
                if (req.isCommand) {
                    const executions = [];
                    for (const k in attributeValues) {
                        executions.push(
                            iotAgentLib.setCommandResult.bind(
                                null,
                                device.name,
                                config.getConfig().iota.defaultResource,
                                req.apiKey,
                                attributeValues[k].name,
                                attributeValues[k].value,
                                constants.COMMAND_STATUS_COMPLETED,
                                device
                            )
                        );
                    }
                    async.parallel(executions, updateCommandHandler);
                } else if (attributeValues.length > 0) {
                    iotAgentLib.update(device.name, device.type, '', attributeValues, device, updateCommandHandler);
                } else {
                    finishSouthBoundTransaction(next);
                }
            }
        }
    }

    function processDeviceMeasure(error, device) {
        if (error) {
            next(error);
        } else {
            const localContext = _.clone(context);
            req.device = device;
            localContext.service = device.service;
            localContext.subservice = device.subservice;
            intoTrans(localContext, processHTTPWithDevice)(device);
        }
    }

    iotaUtils.retrieveDevice(req.deviceId, req.apiKey, transport, processDeviceMeasure);
}

function sendConfigurationToDevice(apiKey, deviceId, results, callback) {
    callback();
}

/**
 * Device provisioning handler.
 *
 * @param {Object} device           Device object containing all the information about the provisioned device.
 */
function deviceProvisioningHandler(device, callback) {
    config.getLogger().debug(context, 'ros2binding.deviceProvisioningHandler [%j]', device);
    ros2Device = device;
    console.log(ros2Device);
    activeAttributes = ros2Device.active;
    if (Array.isArray(activeAttributes)) {
        if (ros2Subscribers.length > 0) {
            while (ros2Subscribers.length > 0) {
                let subscriber = ros2Subscribers.pop();
                ros2Node.destroySubscription(subscriber.subscription);
            }
        }
        if (activeAttributes.length > 0) {
            attributeInterfaces = activeAttributes.map(function (interfaceDescriptor) {
                // create ROS2 subscriber
                let subscriberName = interfaceDescriptor.name;
                let topicType = interfaceDescriptor.metadata.topicType.value;
                let topicName = interfaceDescriptor.metadata.topicName.value;
                let throttlingInMilliseconds = interfaceDescriptor.metadata.throttlingInMilliseconds.value;
                lastMessages[subscriberName] = {};
                lastMessages[subscriberName]['msg'] = 'None';
                lastMessages[subscriberName]['lastDataSampleTs'] = new Date().getTime();
                lastMessages[subscriberName]['throttling'] = throttlingInMilliseconds;
                let subscription = ros2Node.createSubscription(topicType, topicName, (msg) => {
                    let lastTs = lastMessages[subscriberName].lastDataSampleTs;
                    let newTs = new Date().getTime();
                    let interval = newTs - lastTs;
                    if (interval >= lastMessages[subscriberName].throttling) {
                        lastMessages[subscriberName].msg = msg;
                        lastMessages[subscriberName].lastDataSampleTs = new Date().getTime();
                        attribute = {};
                        attribute.name = subscriberName;
                        attribute.type = 'object';
                        attribute.value = msg;
                        attribute.metadata = {};
                        attribute.metadata.topicType = { type: 'string', value: topicType };
                        attribute.metadata.topicName = { type: 'string', value: topicName };
                        attribute.metadata.throttlingInMilliseconds = {
                            type: 'number',
                            value: throttlingInMilliseconds
                        };
                        iotAgentLib.update(ros2Device.name, ros2Device.type, '', [attribute], ros2Device, function (
                            error,
                            output
                        ) {
                            if (error) {
                                console.log('Something went wrong!!!');
                                console.log(error);
                            } else {
                                console.log(`Received message:`);
                                console.log(lastMessages[subscriberName]);
                            }
                        });
                        lastMessages[subscriberName].lastDataSampleTs = new Date().getTime();
                    }
                });
                var newSubscriber = { name: subscriberName, subscription: subscription };
                ros2Subscribers.push(newSubscriber);
            });
        }
    }
    /*interfaces = ros2Device.internalAttributes.map(function(interfaceDescriptor) {
        if (interfaceDescriptor.type == "publisher")
        {
            // create ROS2 publisher
            topicType = interfaceDescriptor.topicType;
            topicName = interfaceDescriptor.topicName;
            publisherName = interfaceDescriptor.ngsiCommandName;
            newPublisher = {"name":publisherName,
                            "object":ros2Node.createPublisher(topicType,topicName)};
            ros2Publishers.push(newPublisher);
        }
        else if (interfaceDescriptor.type == "serviceClient")
        {
            // create serviceClient
            srvClientName = interfaceDescriptor.ngsiCommandName;
            srvType = interfaceDescriptor.serviceType;
            srvName = interfaceDescriptor.serviceName;
            newServiceClient = {"name":srvClientName,
                                "object":ros2Node.createClient(srvType,srvName)};
            ros2ServiceClients.push(ros2Node)
        }
        else if (interfaceDescriptor.type == "actionClient")
        {
            // create actionClient
            actClientName = interfaceDescriptor.ngsiCommandName;
            actType = interfaceDescriptor.actionType;
            actName = interfaceDescriptor.actionName;
            newActionClient = {"name":actClientName,
                               "object":new rclnodejs.ActionClient(ros2node, actType,actName)};
            ros2ActionClients.push(newActionClient);
        }
        else
        {
            config
            .getLogger()
            .debug(context, 'Unknown ROS2 interface type: [%s]', interfaceDescriptor.type);
            config
            .getLogger()
            .debug(context, 'Valid types: publisher|subscriber|serviceClient|actionClient');
        }
    });*/

    callback(null, device);
}

/**
 * Device updating handler. This handler just fills in the transport protocol in case there is none.
 *
 * @param {Object} device           Device object containing all the information about the updated device.
 */
function deviceUpdatingHandler(device, callback) {
    callback(null, device);
}

function start(callback) {
    subscriptions = [];
    ros2Subscribers = [];
    lastMessages = {};
    // Create the IoTA ROS2 Node
    rclnodejs.init().then(() => {
        // Create the ROS 2 Node
        ros2Node = new rclnodejs.Node('iot_agent', 'ngsiv2');
        publisher_init = ros2Node.createPublisher('std_msgs/msg/String', '/iota_check');
        publisher_init.publish('Hello ROS, this is the FIWARE IoTA');
        ros2Node.spin();
    });

    callback();
}

function stop(callback) {
    config.getLogger().info(context, 'Stopping JSON ROS2 Binding: ');
    rclnodejs.shutdownAll();
    callback();
}

function sendPushNotifications(device, values, callback) {
    const executions = _.flatten(values.map(commandHandler.generateCommandExecution.bind(null, null, device)));

    async.series(executions, function (error) {
        callback(error);
    });
}

function storePollNotifications(device, values, callback) {
    function addPollNotification(item, innerCallback) {
        iotAgentLib.addCommand(device.service, device.subservice, device.id, item, innerCallback);
    }

    async.map(values, addPollNotification, callback);
}

function notificationHandler(device, values, callback) {
    if (device.endpoint) {
        sendPushNotifications(device, values, callback);
    } else {
        storePollNotifications(device, values, callback);
    }
}

function executeCommand(apiKey, device, cmdName, serializedPayload, contentType, callback) {
    callback(null, device);
}

exports.start = start;
exports.stop = stop;
exports.sendConfigurationToDevice = sendConfigurationToDevice;
exports.deviceProvisioningHandler = deviceProvisioningHandler;
exports.deviceUpdatingHandler = deviceUpdatingHandler;
exports.notificationHandler = notificationHandler;
exports.executeCommand = executeCommand;
exports.protocol = 'ROS2';
