/// <reference types="node" />
import { EventEmitter } from "events";
import { USBControlTransferParameters, USBInTransferResult, USBOutTransferResult, USBIsochronousInTransferResult, USBIsochronousOutTransferResult } from "./interfaces";
import { USBDevice } from "./device";
export interface Adapter {
    getConnected(handle: string): boolean;
    getOpened(handle: string): boolean;
    listUSBDevices(): Promise<Array<USBDevice>>;
    open(handle: string): Promise<void>;
    close(handle: string): Promise<void>;
    selectConfiguration(handle: string, id: number): Promise<void>;
    claimInterface(handle: string, address: number): Promise<void>;
    releaseInterface(handle: string, address: number): Promise<void>;
    selectAlternateInterface(handle: string, interfaceNumber: number, alternateSetting: number): Promise<void>;
    controlTransferIn(handle: string, setup: USBControlTransferParameters, length: number): Promise<USBInTransferResult>;
    controlTransferOut(handle: string, setup: USBControlTransferParameters, data: ArrayBuffer | ArrayBufferView): Promise<USBOutTransferResult>;
    clearHalt(handle: string, endpointNumber: number): Promise<void>;
    transferIn(handle: string, endpointNumber: number, length: number): Promise<USBInTransferResult>;
    transferOut(handle: string, endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
    isochronousTransferIn(_handle: string, _endpointNumber: number, _packetLengths: Array<number>): Promise<USBIsochronousInTransferResult>;
    isochronousTransferOut(_handle: string, _endpointNumber: number, _data: BufferSource, _packetLengths: Array<number>): Promise<USBIsochronousOutTransferResult>;
    reset(handle: string): Promise<void>;
}
/**
 * @hidden
 */
export declare class USBAdapter extends EventEmitter implements Adapter {
    static EVENT_DEVICE_CONNECT: string;
    static EVENT_DEVICE_DISCONNECT: string;
    private devices;
    constructor();
    private serialPromises<T>(task, params);
    private serialDevicePromises<T>(task, device, descriptors);
    private loadDevices();
    private loadDevice(device);
    private getCapabilities(device);
    private getDeviceCapabilities(device, callback);
    private getBosDescriptor(device, callback);
    private getWebCapability(capabilities);
    private decodeUUID(buffer);
    private getWebUrl(device, capability, suppressErrors?);
    private devicetoUSBDevice(handle);
    private decodeVersion(version);
    private getStringDescriptor(device, index);
    private bufferToDataView(buffer);
    private bufferSourceToBuffer(bufferSource);
    private getEndpoint(device, endpointNumber);
    private getInEndpoint(device, endpointNumber);
    private getOutEndpoint(device, endpointNumber);
    private endpointToUSBEndpoint(descriptor);
    private interfaceToUSBAlternateInterface(device, descriptor);
    private interfacesToUSBInterface(device, descriptors);
    private configToUSBConfiguration(device, descriptor);
    private getDevice(handle);
    private controlTransferParamsToType(setup, direction);
    getConnected(handle: string): boolean;
    getOpened(handle: string): boolean;
    listUSBDevices(): Promise<Array<USBDevice>>;
    open(handle: string): Promise<void>;
    close(handle: string): Promise<void>;
    selectConfiguration(handle: string, id: number): Promise<void>;
    claimInterface(handle: string, address: number): Promise<void>;
    releaseInterface(handle: string, address: number): Promise<void>;
    selectAlternateInterface(handle: string, interfaceNumber: number, alternateSetting: number): Promise<void>;
    controlTransferIn(handle: string, setup: USBControlTransferParameters, length: number): Promise<USBInTransferResult>;
    controlTransferOut(handle: string, setup: USBControlTransferParameters, data: ArrayBuffer | ArrayBufferView): Promise<USBOutTransferResult>;
    clearHalt(handle: string, endpointNumber: number): Promise<void>;
    transferIn(handle: string, endpointNumber: number, length: number): Promise<USBInTransferResult>;
    transferOut(handle: string, endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
    isochronousTransferIn(_handle: string, _endpointNumber: number, _packetLengths: Array<number>): Promise<USBIsochronousInTransferResult>;
    isochronousTransferOut(_handle: string, _endpointNumber: number, _data: BufferSource, _packetLengths: Array<number>): Promise<USBIsochronousOutTransferResult>;
    reset(handle: string): Promise<void>;
}
/**
 * @hidden
 */
export declare const adapter: USBAdapter;
