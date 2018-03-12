"use strict";
/*
* Node WebUSB
* Copyright (c) 2017 Rob Moran
*
* The MIT License (MIT)
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
*/
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const usb_1 = require("usb");
const configuration_1 = require("./configuration");
const interface_1 = require("./interface");
const alternate_1 = require("./alternate");
const endpoint_1 = require("./endpoint");
const device_1 = require("./device");
/**
 * @hidden
 */
const CONSTANTS = {
    WEB_UUID: "3408b638-09a9-47a0-8bfd-a0768815b665",
    LIBUSB_DT_BOS: 0x0f,
    LIBUSB_DT_BOS_SIZE: 0x05,
    LIBUSB_TRANSFER_TYPE_MASK: 0x03,
    USB_VERSION: 0x201,
    CAPABILITY_VERSION: 0x0100,
    URL_REQUEST_TYPE: 0xC0,
    URL_REQUEST_INDEX: 0x02,
    CLEAR_FEATURE: 0x01,
    ENDPOINT_HALT: 0x00
};
/**
 * @hidden
 */
class USBAdapter extends events_1.EventEmitter {
    constructor() {
        super();
        // Maintains a live list of connected Web USB devices
        this.devices = {};
        usb_1.on("attach", device => {
            this.loadDevice(device)
                .then(loadedDevice => {
                if (loadedDevice) {
                    this.devicetoUSBDevice(loadedDevice.deviceAddress.toString())
                        .then(usbDevice => {
                        this.emit(USBAdapter.EVENT_DEVICE_CONNECT, usbDevice);
                    });
                }
            });
        });
        usb_1.on("detach", device => {
            if (device.deviceAddress) {
                const address = device.deviceAddress.toString();
                if (this.devices[address]) {
                    this.emit(USBAdapter.EVENT_DEVICE_DISCONNECT, address);
                    delete this.devices[address];
                }
            }
        });
    }
    serialPromises(task, params) {
        function reducer(chain, param) {
            return chain
                .then(results => {
                return task.call(this, param)
                    .then(result => {
                    results.push(result);
                    return results;
                });
            });
        }
        return params.reduce(reducer.bind(this), Promise.resolve([]));
    }
    serialDevicePromises(task, device, descriptors) {
        function reducer(chain, descriptor) {
            return chain
                .then(results => {
                return task.call(this, device, descriptor)
                    .then(result => {
                    results.push(result);
                    return results;
                });
            });
        }
        return descriptors.reduce(reducer.bind(this), Promise.resolve([]));
    }
    loadDevices() {
        const devices = usb_1.getDeviceList();
        return this.serialPromises(this.loadDevice, devices);
    }
    loadDevice(device) {
        return this.getCapabilities(device)
            .then(capabilities => this.getWebCapability(capabilities))
            .then(capability => {
            if (!capability)
                return null;
            return this.getWebUrl(device, capability)
                .then(url => {
                this.devices[device.deviceAddress.toString()] = {
                    device: device,
                    url: url
                };
                return device;
            });
        });
    }
    getCapabilities(device) {
        return new Promise((resolve, reject) => {
            try {
                device.open();
            }
            catch (_e) {
                resolve([]);
            }
            // device.getCapabilities((error, capabilities) => {
            this.getDeviceCapabilities(device, (error, capabilities) => {
                try {
                    // Older macs (<10.12) can error with some host devices during a close at this point
                    device.close();
                    // tslint:disable-next-line:no-empty
                }
                catch (_e) { }
                if (error)
                    return reject(error);
                resolve(capabilities);
            });
        });
    }
    getDeviceCapabilities(device, callback) {
        const capabilities = [];
        this.getBosDescriptor(device, (error, descriptor) => {
            if (error)
                return callback(error, null);
            const len = descriptor ? descriptor.capabilities.length : 0;
            for (let i = 0; i < len; i++) {
                capabilities.push({
                    device: device,
                    id: i,
                    descriptor: descriptor.capabilities[i],
                    type: descriptor.capabilities[i].bDevCapabilityType,
                    data: descriptor.capabilities[i].dev_capability_data
                });
            }
            callback(undefined, capabilities);
        });
    }
    getBosDescriptor(device, callback) {
        if (device.deviceDescriptor.bcdUSB < CONSTANTS.USB_VERSION) {
            // BOS is only supported from USB 2.0.1
            return callback(undefined, null);
        }
        device.controlTransfer(usb_1.LIBUSB_ENDPOINT_IN, usb_1.LIBUSB_REQUEST_GET_DESCRIPTOR, (CONSTANTS.LIBUSB_DT_BOS << 8), 0, CONSTANTS.LIBUSB_DT_BOS_SIZE, (error1, buffer1) => {
            if (error1)
                return callback(undefined, null);
            const totalLength = buffer1.readUInt16LE(2);
            device.controlTransfer(usb_1.LIBUSB_ENDPOINT_IN, usb_1.LIBUSB_REQUEST_GET_DESCRIPTOR, (CONSTANTS.LIBUSB_DT_BOS << 8), 0, totalLength, (error, buffer) => {
                if (error)
                    return callback(undefined, null);
                const descriptor = {
                    bLength: buffer.readUInt8(0),
                    bDescriptorType: buffer.readUInt8(1),
                    wTotalLength: buffer.readUInt16LE(2),
                    bNumDeviceCaps: buffer.readUInt8(4),
                    capabilities: []
                };
                let i = CONSTANTS.LIBUSB_DT_BOS_SIZE;
                while (i < descriptor.wTotalLength) {
                    const capability = {
                        bLength: buffer.readUInt8(i + 0),
                        bDescriptorType: buffer.readUInt8(i + 1),
                        bDevCapabilityType: buffer.readUInt8(i + 2)
                    };
                    capability.dev_capability_data = buffer.slice(i + 3, i + capability.bLength);
                    descriptor.capabilities.push(capability);
                    i += capability.bLength;
                }
                // Cache descriptor
                callback(undefined, descriptor);
            });
        });
    }
    getWebCapability(capabilities) {
        const platformCapabilities = capabilities.filter(capability => {
            return capability.type === 5;
        });
        const webCapability = platformCapabilities.find(capability => {
            const uuid = this.decodeUUID(capability.data.slice(1, 17));
            const version = capability.data.readUInt16LE(17);
            return uuid === CONSTANTS.WEB_UUID && version === CONSTANTS.CAPABILITY_VERSION;
        });
        return webCapability;
    }
    decodeUUID(buffer) {
        const data1 = `00000000${buffer.readUInt32LE(0).toString(16)}`.slice(-8);
        const data2 = `0000${buffer.readUInt16LE(4).toString(16)}`.slice(-4);
        const data3 = `0000${buffer.readUInt16LE(6).toString(16)}`.slice(-4);
        const data4 = [];
        for (let i = 8; i < 10; i++) {
            data4.push(`00${buffer.readUInt8(i).toString(16)}`.slice(-2));
        }
        const data5 = [];
        for (let i = 10; i < 16; i++) {
            data5.push(`00${buffer.readUInt8(i).toString(16)}`.slice(-2));
        }
        return `${data1}-${data2}-${data3}-${data4.join("")}-${data5.join("")}`;
    }
    getWebUrl(device, capability, suppressErrors = true) {
        return new Promise((resolve, reject) => {
            if (!capability || !capability.data || capability.data.byteLength < 20)
                return resolve(null);
            const vendor = capability.data.readUInt8(19);
            const page = capability.data.readUInt8(20);
            device.open();
            device.controlTransfer(CONSTANTS.URL_REQUEST_TYPE, vendor, page, CONSTANTS.URL_REQUEST_INDEX, 64, (error, buffer) => {
                device.close();
                if (error) {
                    // An error may be due to the URL not existing
                    if (suppressErrors)
                        return resolve(null);
                    else
                        return reject(error);
                }
                // const length = buffer.readUInt8(0);
                // const type = buffer.readUInt8(1);
                let url = buffer.toString("utf8", 3);
                const scheme = buffer.readUInt8(2); // 0 - http, 1 - https, 255 - in url
                if (scheme === 0)
                    url = "http://" + url;
                if (scheme === 1)
                    url = "https://" + url;
                resolve(url);
            });
        });
    }
    devicetoUSBDevice(handle) {
        return new Promise((resolve, _reject) => {
            const device = this.devices[handle].device;
            const url = this.devices[handle].url;
            const configs = device.allConfigDescriptors;
            return this.serialDevicePromises(this.configToUSBConfiguration, device, configs)
                .then(configurations => {
                if (!device.deviceDescriptor) {
                    return resolve(new device_1.USBDevice({
                        _handle: device.deviceAddress.toString(),
                        url: url,
                        configurations: configurations
                    }));
                }
                const descriptor = device.deviceDescriptor;
                const deviceVersion = this.decodeVersion(descriptor.bcdDevice);
                const usbVersion = this.decodeVersion(descriptor.bcdUSB);
                let manufacturerName = null;
                let productName = null;
                return this.getStringDescriptor(device, descriptor.iManufacturer)
                    .then(name => {
                    manufacturerName = name;
                    return this.getStringDescriptor(device, descriptor.iProduct);
                })
                    .then(name => {
                    productName = name;
                    return this.getStringDescriptor(device, descriptor.iSerialNumber);
                })
                    .then(serialNumber => {
                    const props = {
                        _handle: device.deviceAddress.toString(),
                        _maxPacketSize: descriptor.bMaxPacketSize0,
                        url: url,
                        deviceClass: descriptor.bDeviceClass,
                        deviceSubclass: descriptor.bDeviceSubClass,
                        deviceProtocol: descriptor.bDeviceProtocol,
                        productId: descriptor.idProduct,
                        vendorId: descriptor.idVendor,
                        deviceVersionMajor: deviceVersion.major,
                        deviceVersionMinor: deviceVersion.minor,
                        deviceVersionSubminor: deviceVersion.sub,
                        usbVersionMajor: usbVersion.major,
                        usbVersionMinor: usbVersion.minor,
                        usbVersionSubminor: usbVersion.sub,
                        manufacturerName: manufacturerName,
                        productName: productName,
                        serialNumber: serialNumber,
                        configurations: configurations,
                        _currentConfiguration: device.configDescriptor.bConfigurationValue
                    };
                    return resolve(new device_1.USBDevice(props));
                });
            });
        });
    }
    decodeVersion(version) {
        const hex = `0000${version.toString(16)}`.slice(-4);
        return {
            major: parseInt(hex.substr(0, 2), null),
            minor: parseInt(hex.substr(2, 1), null),
            sub: parseInt(hex.substr(3, 1), null),
        };
    }
    getStringDescriptor(device, index) {
        return new Promise((resolve, reject) => {
            device.open();
            device.getStringDescriptor(index, (error, buffer) => {
                device.close();
                if (error)
                    return reject(error);
                resolve(buffer.toString());
            });
        });
    }
    bufferToDataView(buffer) {
        const arrayBuffer = new Uint8Array(buffer).buffer;
        return new DataView(arrayBuffer);
    }
    bufferSourceToBuffer(bufferSource) {
        function isView(source) {
            return source.buffer !== undefined;
        }
        const arrayBuffer = isView(bufferSource) ? bufferSource.buffer : bufferSource;
        return new Buffer(arrayBuffer);
    }
    getEndpoint(device, endpointNumber) {
        let endpoint = null;
        device.interfaces.some(iface => {
            const epoint = iface.endpoint(endpointNumber);
            if (epoint) {
                endpoint = epoint;
                return true;
            }
        });
        return endpoint;
    }
    getInEndpoint(device, endpointNumber) {
        const endpoint = this.getEndpoint(device, endpointNumber);
        if (endpoint && endpoint.direction === "in")
            return endpoint;
    }
    getOutEndpoint(device, endpointNumber) {
        const endpoint = this.getEndpoint(device, endpointNumber);
        if (endpoint && endpoint.direction === "out")
            return endpoint;
    }
    endpointToUSBEndpoint(descriptor) {
        return new endpoint_1.USBEndpoint({
            endpointNumber: descriptor.bEndpointAddress,
            direction: descriptor.bEndpointAddress & usb_1.LIBUSB_ENDPOINT_IN ? "in" : "out",
            type: (descriptor.bmAttributes & CONSTANTS.LIBUSB_TRANSFER_TYPE_MASK) === usb_1.LIBUSB_TRANSFER_TYPE_BULK ? "bulk"
                : (descriptor.bmAttributes & CONSTANTS.LIBUSB_TRANSFER_TYPE_MASK) === usb_1.LIBUSB_TRANSFER_TYPE_INTERRUPT ? "interrupt"
                    : "isochronous",
            packetSize: descriptor.wMaxPacketSize
        });
    }
    interfaceToUSBAlternateInterface(device, descriptor) {
        return this.getStringDescriptor(device, descriptor.iInterface)
            .then(name => {
            return new alternate_1.USBAlternateInterface({
                alternateSetting: descriptor.bAlternateSetting,
                interfaceClass: descriptor.bInterfaceClass,
                interfaceSubclass: descriptor.bInterfaceSubClass,
                interfaceProtocol: descriptor.bInterfaceProtocol,
                interfaceName: name,
                endpoints: descriptor.endpoints.map(this.endpointToUSBEndpoint)
            });
        });
    }
    interfacesToUSBInterface(device, descriptors) {
        return this.serialDevicePromises(this.interfaceToUSBAlternateInterface, device, descriptors)
            .then(alternates => {
            return new interface_1.USBInterface({
                _handle: device.deviceAddress.toString(),
                interfaceNumber: descriptors[0].bInterfaceNumber,
                alternates: alternates
            });
        });
    }
    configToUSBConfiguration(device, descriptor) {
        return this.getStringDescriptor(device, descriptor.iConfiguration)
            .then(name => {
            const allInterfaces = descriptor.interfaces || [];
            return this.serialDevicePromises(this.interfacesToUSBInterface, device, allInterfaces)
                .then(interfaces => {
                return new configuration_1.USBConfiguration({
                    configurationValue: descriptor.bConfigurationValue,
                    configurationName: name,
                    interfaces: interfaces
                });
            });
        });
    }
    getDevice(handle) {
        if (!this.devices[handle])
            return null;
        return this.devices[handle].device;
    }
    controlTransferParamsToType(setup, direction) {
        const recipient = setup.recipient === "device" ? usb_1.LIBUSB_RECIPIENT_DEVICE
            : setup.recipient === "interface" ? usb_1.LIBUSB_RECIPIENT_INTERFACE
                : setup.recipient === "endpoint" ? usb_1.LIBUSB_RECIPIENT_ENDPOINT
                    : usb_1.LIBUSB_RECIPIENT_OTHER;
        const requestType = setup.requestType === "standard" ? usb_1.LIBUSB_REQUEST_TYPE_STANDARD
            : setup.requestType === "class" ? usb_1.LIBUSB_REQUEST_TYPE_CLASS
                : usb_1.LIBUSB_REQUEST_TYPE_VENDOR;
        return recipient | requestType | direction;
    }
    getConnected(handle) {
        return this.getDevice(handle) !== null;
    }
    getOpened(handle) {
        const device = this.getDevice(handle);
        if (!device)
            return false;
        return (device.interfaces !== null);
    }
    listUSBDevices() {
        return this.loadDevices()
            .then(() => {
            return this.serialPromises(this.devicetoUSBDevice, Object.keys(this.devices));
        });
    }
    open(handle) {
        return new Promise((resolve, _reject) => {
            const device = this.getDevice(handle);
            device.open();
            resolve();
        });
    }
    close(handle) {
        return new Promise((resolve, _reject) => {
            const device = this.getDevice(handle);
            device.close();
            resolve();
        });
    }
    selectConfiguration(handle, id) {
        return new Promise((resolve, reject) => {
            const device = this.getDevice(handle);
            device.setConfiguration(id, error => {
                if (error)
                    return reject(error);
                resolve();
            });
        });
    }
    claimInterface(handle, address) {
        return new Promise((resolve, _reject) => {
            const device = this.getDevice(handle);
            device.interface(address).claim();
            resolve();
        });
    }
    releaseInterface(handle, address) {
        return new Promise((resolve, reject) => {
            const device = this.getDevice(handle);
            device.interface(address).release(true, error => {
                if (error)
                    return reject(error);
                resolve();
            });
        });
    }
    selectAlternateInterface(handle, interfaceNumber, alternateSetting) {
        return new Promise((resolve, reject) => {
            const device = this.getDevice(handle);
            const iface = device.interface(interfaceNumber);
            iface.setAltSetting(alternateSetting, error => {
                if (error)
                    return reject(error);
                resolve();
            });
        });
    }
    controlTransferIn(handle, setup, length) {
        return new Promise((resolve, reject) => {
            const device = this.getDevice(handle);
            const type = this.controlTransferParamsToType(setup, usb_1.LIBUSB_ENDPOINT_IN);
            device.controlTransfer(type, setup.request, setup.value, setup.index, length, (error, buffer) => {
                if (error)
                    return reject(error);
                resolve({
                    data: this.bufferToDataView(buffer),
                    status: "ok" // hack
                });
            });
        });
    }
    controlTransferOut(handle, setup, data) {
        return new Promise((resolve, reject) => {
            const device = this.getDevice(handle);
            const type = this.controlTransferParamsToType(setup, usb_1.LIBUSB_ENDPOINT_OUT);
            const buffer = this.bufferSourceToBuffer(data);
            device.controlTransfer(type, setup.request, setup.value, setup.index, buffer, error => {
                if (error)
                    return reject(error);
                resolve({
                    bytesWritten: buffer.byteLength,
                    status: "ok" // hack
                });
            });
        });
    }
    clearHalt(handle, endpointNumber) {
        return new Promise((resolve, reject) => {
            const device = this.getDevice(handle);
            device.controlTransfer(usb_1.LIBUSB_RECIPIENT_ENDPOINT, CONSTANTS.CLEAR_FEATURE, CONSTANTS.ENDPOINT_HALT, endpointNumber, 0, error => {
                if (error)
                    return reject(error);
                resolve();
            });
        });
    }
    transferIn(handle, endpointNumber, length) {
        return new Promise((resolve, reject) => {
            const device = this.getDevice(handle);
            const endpoint = this.getInEndpoint(device, endpointNumber);
            endpoint.transfer(length, (error, data) => {
                if (error)
                    return reject(error);
                resolve({
                    data: this.bufferToDataView(data),
                    status: "ok" // hack
                });
            });
        });
    }
    transferOut(handle, endpointNumber, data) {
        return new Promise((resolve, reject) => {
            const device = this.getDevice(handle);
            const endpoint = this.getOutEndpoint(device, endpointNumber);
            const buffer = this.bufferSourceToBuffer(data);
            endpoint.transfer(buffer, error => {
                if (error)
                    return reject(error);
                resolve({
                    bytesWritten: buffer.byteLength,
                    status: "ok" // hack
                });
            });
        });
    }
    isochronousTransferIn(_handle, _endpointNumber, _packetLengths) {
        return new Promise((_resolve, reject) => {
            reject("isochronousTransferIn error: method not implemented");
        });
    }
    isochronousTransferOut(_handle, _endpointNumber, _data, _packetLengths) {
        return new Promise((_resolve, reject) => {
            reject("isochronousTransferOut error: method not implemented");
        });
    }
    reset(handle) {
        return new Promise((resolve, reject) => {
            const device = this.getDevice(handle);
            device.reset(error => {
                if (error)
                    return reject(error);
                resolve();
            });
        });
    }
}
USBAdapter.EVENT_DEVICE_CONNECT = "connect";
USBAdapter.EVENT_DEVICE_DISCONNECT = "disconnect";
exports.USBAdapter = USBAdapter;
/**
 * @hidden
 */
exports.adapter = new USBAdapter();

//# sourceMappingURL=adapter.js.map
